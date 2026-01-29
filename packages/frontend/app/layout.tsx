export const metadata = {
  title: "HydroDoc AI",
  description: "水政通公文智能体前端",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
