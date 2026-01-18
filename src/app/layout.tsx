import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { ComplianceBanner } from "@/components/layout/ComplianceBanner";
import { BeginnerModeProvider } from "@/components/providers/BeginnerModeProvider";
import { AppModeProvider } from "@/contexts/AppModeContext";
import { DataProvider } from "@/hooks/useMarketData";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Rogue Triangulum | Stock Market Intelligence",
  description: "Personal-use stock market intelligence cockpit for high-quality trading setups with explainable AI ranking.",
  keywords: ["trading", "stock market", "day trading", "options", "swing trading", "investing"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans`}>
        <AppModeProvider>
          <BeginnerModeProvider>
            <DataProvider>
              {/* Compliance Disclaimer - Always visible */}
              <ComplianceBanner />

              {/* Main App Layout */}
              <div className="flex min-h-screen pt-10">
                {/* Sidebar Navigation */}
                <Sidebar />

                {/* Main Content Area */}
                <main className="flex-1 ml-64 p-6">
                  {children}
                </main>
              </div>
            </DataProvider>
          </BeginnerModeProvider>
        </AppModeProvider>
      </body>
    </html>
  );
}
