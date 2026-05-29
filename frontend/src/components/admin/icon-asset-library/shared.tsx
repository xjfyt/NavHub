export const cell: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: 13,
  borderBottom: "1px solid var(--admin-border-soft)",
  verticalAlign: "middle",
};

export const th: React.CSSProperties = {
  ...cell,
  fontWeight: 600,
  color: "var(--text-soft)",
  background: "var(--admin-border-soft)",
  whiteSpace: "nowrap",
};

export const EmptyCell = ({ text }: { text?: string }) => (
  <div
    style={{
      color: "var(--text-soft)",
      fontSize: 13,
      padding: "24px 0",
      textAlign: "center",
    }}
  >
    {text ?? "暂无数据"}
  </div>
);
