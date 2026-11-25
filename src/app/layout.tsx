import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "宿灵AI",
  description: "面向民宿的内容生产与运营平台",
  icons: {
    icon: "/suling-mark.svg"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
