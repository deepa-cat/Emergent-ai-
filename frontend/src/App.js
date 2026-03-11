import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import DocMindAI from "@/DocMindAI";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<DocMindAI />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
