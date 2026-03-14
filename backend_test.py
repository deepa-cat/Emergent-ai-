#!/usr/bin/env python3
"""
Backend API Test for DocMind AI
Tests all API endpoints including chat functionality with Claude AI
"""

import requests
import json
import sys
from datetime import datetime

class DocMindAPITester:
    def __init__(self, base_url="https://ai-assistant-732.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, status_code=None, error=None, response_data=None):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
        
        result = {
            "test_name": name,
            "success": success,
            "status_code": status_code,
            "error": error,
            "response_data": response_data
        }
        self.test_results.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"\n{status} - {name}")
        if status_code:
            print(f"   Status: {status_code}")
        if error:
            print(f"   Error: {error}")
        if response_data and isinstance(response_data, dict):
            if 'message' in response_data:
                print(f"   Response: {response_data['message']}")
            elif 'response' in response_data:
                print(f"   AI Response: {response_data['response'][:100]}...")

    def test_api_root(self):
        """Test API root endpoint"""
        try:
            response = requests.get(f"{self.api_url}/", timeout=10)
            success = response.status_code == 200
            data = response.json() if success else None
            self.log_test("API Root", success, response.status_code, 
                         None if success else "Failed to reach root endpoint", data)
            return success
        except Exception as e:
            self.log_test("API Root", False, None, str(e))
            return False

    def test_status_endpoints(self):
        """Test status check endpoints"""
        try:
            # Test POST /status
            test_data = {"client_name": f"test_client_{datetime.now().strftime('%H%M%S')}"}
            response = requests.post(f"{self.api_url}/status", 
                                   json=test_data, timeout=10)
            success = response.status_code == 200
            data = response.json() if success else None
            self.log_test("POST /status", success, response.status_code, 
                         None if success else "Failed to create status check", data)
            
            if not success:
                return False
            
            # Test GET /status
            response = requests.get(f"{self.api_url}/status", timeout=10)
            success = response.status_code == 200
            data = response.json() if success else None
            self.log_test("GET /status", success, response.status_code, 
                         None if success else "Failed to get status checks", 
                         {"count": len(data) if data else 0})
            
            return success
        except Exception as e:
            self.log_test("Status Endpoints", False, None, str(e))
            return False

    def test_chat_endpoint_basic(self):
        """Test chat endpoint with basic request"""
        try:
            chat_data = {
                "messages": [
                    {"role": "user", "content": "Hello, can you help me?"}
                ],
                "document_context": "This is a test document about artificial intelligence and machine learning.",
                "session_id": f"test_session_{datetime.now().strftime('%H%M%S')}"
            }
            
            response = requests.post(f"{self.api_url}/chat", 
                                   json=chat_data, timeout=30)
            success = response.status_code == 200
            data = response.json() if success else None
            
            if success and data:
                # Check if we got a valid AI response
                ai_response = data.get('response', '')
                error = data.get('error')
                if error:
                    success = False
                    self.log_test("POST /chat (Basic)", False, response.status_code, 
                                 f"AI Error: {error}")
                else:
                    self.log_test("POST /chat (Basic)", True, response.status_code, 
                                 None, {"response": ai_response})
            else:
                self.log_test("POST /chat (Basic)", False, response.status_code, 
                             "No valid response data")
            
            return success
        except Exception as e:
            self.log_test("POST /chat (Basic)", False, None, str(e))
            return False

    def test_chat_endpoint_document_qa(self):
        """Test chat endpoint with document Q&A"""
        try:
            document_text = """
            Title: Introduction to Machine Learning
            
            Machine Learning (ML) is a subset of artificial intelligence that enables computers to learn and make decisions from data without being explicitly programmed. There are three main types of machine learning:
            
            1. Supervised Learning: Uses labeled data to train models
            2. Unsupervised Learning: Finds patterns in unlabeled data
            3. Reinforcement Learning: Learns through interaction with environment
            
            Popular algorithms include:
            - Linear Regression
            - Decision Trees
            - Neural Networks
            - Support Vector Machines
            """
            
            chat_data = {
                "messages": [
                    {"role": "user", "content": "What are the three main types of machine learning mentioned in this document?"}
                ],
                "document_context": document_text,
                "session_id": f"test_qa_session_{datetime.now().strftime('%H%M%S')}"
            }
            
            response = requests.post(f"{self.api_url}/chat", 
                                   json=chat_data, timeout=30)
            success = response.status_code == 200
            data = response.json() if success else None
            
            if success and data:
                ai_response = data.get('response', '')
                error = data.get('error')
                if error:
                    success = False
                    self.log_test("POST /chat (Document Q&A)", False, response.status_code, 
                                 f"AI Error: {error}")
                else:
                    # Check if response mentions the ML types
                    response_lower = ai_response.lower()
                    has_supervised = 'supervised' in response_lower
                    has_unsupervised = 'unsupervised' in response_lower
                    has_reinforcement = 'reinforcement' in response_lower
                    
                    if has_supervised and has_unsupervised and has_reinforcement:
                        self.log_test("POST /chat (Document Q&A)", True, response.status_code, 
                                     None, {"response": ai_response, "content_check": "✅ Found all 3 ML types"})
                    else:
                        self.log_test("POST /chat (Document Q&A)", False, response.status_code, 
                                     f"AI response incomplete - missing ML types", 
                                     {"response": ai_response, "content_check": f"Supervised: {has_supervised}, Unsupervised: {has_unsupervised}, Reinforcement: {has_reinforcement}"})
                        success = False
            else:
                self.log_test("POST /chat (Document Q&A)", False, response.status_code, 
                             "No valid response data")
            
            return success
        except Exception as e:
            self.log_test("POST /chat (Document Q&A)", False, None, str(e))
            return False

    def test_chat_endpoint_multilingual(self):
        """Test chat endpoint with Tamil language support"""
        try:
            chat_data = {
                "messages": [
                    {"role": "user", "content": "இந்த ஆவணத்தை தமிழில் சுருக்கமாக விளக்கவும்"}
                ],
                "document_context": "This document discusses the benefits of renewable energy sources like solar and wind power for sustainable development.",
                "session_id": f"test_tamil_session_{datetime.now().strftime('%H%M%S')}"
            }
            
            response = requests.post(f"{self.api_url}/chat", 
                                   json=chat_data, timeout=30)
            success = response.status_code == 200
            data = response.json() if success else None
            
            if success and data:
                ai_response = data.get('response', '')
                error = data.get('error')
                if error:
                    success = False
                    self.log_test("POST /chat (Tamil)", False, response.status_code, 
                                 f"AI Error: {error}")
                else:
                    self.log_test("POST /chat (Tamil)", True, response.status_code, 
                                 None, {"response": ai_response})
            else:
                self.log_test("POST /chat (Tamil)", False, response.status_code, 
                             "No valid response data")
            
            return success
        except Exception as e:
            self.log_test("POST /chat (Tamil)", False, None, str(e))
            return False

    def test_invalid_requests(self):
        """Test error handling with invalid requests"""
        try:
            # Test empty messages
            invalid_data = {
                "messages": [],
                "document_context": "Test document",
                "session_id": "test_invalid"
            }
            
            response = requests.post(f"{self.api_url}/chat", 
                                   json=invalid_data, timeout=10)
            success = response.status_code == 400  # Should return bad request
            self.log_test("POST /chat (Invalid - Empty Messages)", success, 
                         response.status_code, None if success else "Should return 400 for empty messages")
            
            # Test missing document context
            invalid_data2 = {
                "messages": [{"role": "user", "content": "Test"}],
                "session_id": "test_invalid2"
            }
            
            response = requests.post(f"{self.api_url}/chat", 
                                   json=invalid_data2, timeout=10)
            # This might succeed with empty context, so we just check if it responds
            success = response.status_code in [200, 400]
            self.log_test("POST /chat (Missing Context)", success, 
                         response.status_code, None if success else "Should handle missing context")
            
            return True
        except Exception as e:
            self.log_test("Invalid Request Tests", False, None, str(e))
            return False

    def run_all_tests(self):
        """Run all API tests"""
        print("🧪 Starting DocMind AI Backend Tests")
        print(f"🔗 Testing API at: {self.api_url}")
        print("=" * 50)
        
        # Basic connectivity
        if not self.test_api_root():
            print("❌ Cannot connect to API. Stopping tests.")
            return False
        
        # Status endpoints
        self.test_status_endpoints()
        
        # Chat functionality
        self.test_chat_endpoint_basic()
        self.test_chat_endpoint_document_qa()
        self.test_chat_endpoint_multilingual()
        
        # Error handling
        self.test_invalid_requests()
        
        # Print summary
        print("\n" + "=" * 50)
        print(f"📊 Test Summary: {self.tests_passed}/{self.tests_run} tests passed")
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        print(f"📈 Success Rate: {success_rate:.1f}%")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return True
        else:
            print("⚠️  Some tests failed. Check the details above.")
            return False

    def get_test_summary(self):
        """Get test results summary"""
        return {
            "total_tests": self.tests_run,
            "passed_tests": self.tests_passed,
            "failed_tests": self.tests_run - self.tests_passed,
            "success_rate": (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0,
            "test_details": self.test_results
        }

def main():
    """Main test function"""
    tester = DocMindAPITester()
    success = tester.run_all_tests()
    
    # Save detailed results
    results = tester.get_test_summary()
    with open('/app/backend_test_results.json', 'w') as f:
        json.dump(results, f, indent=2)
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())