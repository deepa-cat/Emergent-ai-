from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone
from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.llm.openai import OpenAITextToSpeech
import base64


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Ignore MongoDB's _id field
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str


# DocMind AI Models
class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    document_context: str
    session_id: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    error: Optional[str] = None

class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = "nova"
    speed: Optional[float] = 1.0


# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.model_dump()
    status_obj = StatusCheck(**status_dict)
    
    # Convert to dict and serialize datetime to ISO string for MongoDB
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    
    _ = await db.status_checks.insert_one(doc)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    # Exclude MongoDB's _id field from the query results
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    
    # Convert ISO string timestamps back to datetime objects
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    
    return status_checks


# DocMind AI Chat Endpoint
@api_router.post("/chat", response_model=ChatResponse)
async def chat_with_ai(request: ChatRequest):
    """
    Chat endpoint for DocMind AI
    Accepts user messages with document context and returns AI response
    """
    try:
        # Validate messages array
        if not request.messages or len(request.messages) == 0:
            raise HTTPException(status_code=400, detail="Messages array cannot be empty")
        
        # Validate document context
        if not request.document_context or not request.document_context.strip():
            raise HTTPException(status_code=400, detail="Document context is required")
        
        # Get API key from environment
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="API key not configured")
        
        # Generate session ID if not provided
        session_id = request.session_id or str(uuid.uuid4())
        
        # System message for DocMind AI
        system_message = """You are "DocMind AI" - a smart document assistant that reads uploaded files and answers questions.
CAPABILITIES: Summarize, Q&A, Translate to any language, Key Points, Explain Simply.
RULES:
- Base answers ONLY on the provided document content
- If info is not in the document, say so clearly
- Reply in the same language the user writes in
- Be helpful for both Students and Business users"""
        
        # Initialize LLM Chat with Claude Sonnet 4
        chat = LlmChat(
            api_key=api_key,
            session_id=session_id,
            system_message=system_message
        ).with_model("anthropic", "claude-4-sonnet-20250514")
        
        # Get the last user message
        last_message = request.messages[-1]
        if last_message.role != "user":
            raise HTTPException(status_code=400, detail="Last message must be from user")
        
        # Combine document context with user message
        full_message = f"{request.document_context}\n\nUser: {last_message.content}"
        
        # Create user message
        user_message = UserMessage(text=full_message)
        
        # Send message and get response
        response = await chat.send_message(user_message)
        
        return ChatResponse(response=response, error=None)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Chat error: {str(e)}")
        return ChatResponse(
            response="",
            error=f"Error processing request: {str(e)}"
        )


# Text-to-Speech Endpoint
@api_router.post("/tts")
async def text_to_speech(request: TTSRequest):
    """
    Convert text to speech using OpenAI TTS
    Returns audio as base64 encoded string
    """
    try:
        # Get API key from environment
        api_key = os.environ.get('EMERGENT_LLM_KEY')
        if not api_key:
            raise HTTPException(status_code=500, detail="API key not configured")
        
        # Validate text length (OpenAI limit is 4096 characters)
        if len(request.text) > 4096:
            raise HTTPException(status_code=400, detail="Text too long. Maximum 4096 characters.")
        
        # Initialize OpenAI TTS
        tts = OpenAITextToSpeech(api_key=api_key)
        
        # Generate speech audio
        audio_bytes = await tts.generate_speech(
            text=request.text,
            model="tts-1",  # Fast model for real-time use
            voice=request.voice,
            speed=request.speed
        )
        
        # Convert to base64 for frontend
        audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
        
        return {"audio": audio_base64, "error": None}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"TTS error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"TTS generation failed: {str(e)}")


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
