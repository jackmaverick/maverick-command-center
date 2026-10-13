export const dynamic = "force-dynamic";
export const revalidate = 60;

export default function MetricsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
