import { useState } from "react";
import type { WidgetProps } from "./types";

export const CalculatorWidget = (_props: WidgetProps = {}) => {
  const [expr, setExpr] = useState("");
  const [result, setResult] = useState("0");
  const press = (v: string) => {
    if (v === "=") {
      try {
        const r = Function(`"use strict";return (${expr.replace(/×/g, '*').replace(/÷/g, '/')})`)();
        setResult(String(r));
        setExpr("");
      } catch { setResult("Err"); }
    } else if (v === "C") { setExpr(""); setResult("0"); }
    else if (v === "⌫") { setExpr(s => s.slice(0, -1)); }
    else { setExpr(s => s + v); setResult(""); }
  };
  const keys = [
    ["C", "⌫", "÷", "×"],
    ["7", "8", "9", "-"],
    ["4", "5", "6", "+"],
    ["1", "2", "3", "="],
    ["0", ".", "%", ""],
  ];
  return (
    <div className="widget w-calc">
      <div className="widget-header">
        <span className="widget-title">计算器</span>
        <span className="muted mono" style={{ fontSize: 10 }}>CALC</span>
      </div>
      <div className="disp">{expr || result || "0"}</div>
      <div className="keys">
        {keys.flat().map((k, i) => (
          k ? <button key={i} className={"+-×÷%=".includes(k) ? "op" : "" + (k === "=" ? " eq" : "")} onClick={() => press(k)}>{k}</button> : <div key={i} />
        ))}
      </div>
    </div>
  );
};

