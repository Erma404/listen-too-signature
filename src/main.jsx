import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import SignatureGenerator from "./SignatureGenerator.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <SignatureGenerator />
  </React.StrictMode>
);
