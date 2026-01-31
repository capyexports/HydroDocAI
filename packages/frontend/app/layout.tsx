import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata = {
  title: "水政通 HydroDoc AI",
  description: "水政监察公文智能辅助系统",
};

type RootLayoutProps = {
  children: React.ReactNode;
  params?: Promise<Record<string, string | string[]>>;
  searchParams?: Promise<Record<string, string | string[]>>;
};
export default async function RootLayout(props: RootLayoutProps) {
  const [resolvedParams, resolvedSearchParams] = await Promise.all([
    props.params ?? Promise.resolve({}),
    props.searchParams ?? Promise.resolve({}),
  ]);
  void resolvedParams;
  void resolvedSearchParams;
  return (
    <html lang="zh-CN" className={inter.variable}>
      <body className="min-h-screen bg-hydro-bg font-sans antialiased">{props.children}</body>
    </html>
  );
}
