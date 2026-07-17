import "./globals.css";

export const metadata = {
  title: "Taco Bell Order Optimizer",
  description: "Find the cheapest way to order what you actually want.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
