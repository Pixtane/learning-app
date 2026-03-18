import type { Metadata } from "next";
import { Podkova, Roboto_Slab } from "next/font/google";
import "./globals.css";

const monomakh = Roboto_Slab({
  variable: "--font-display",
  subsets: ["latin", "cyrillic"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Learning App | Наголоси",
  description: "Український тренажер наголосів на Next.js та Neon Postgres",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk">
      <body className={`${monomakh.variable} antialiased`}>{children}</body>
    </html>
  );
}
