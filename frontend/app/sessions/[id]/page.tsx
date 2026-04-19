import SessionWorkspace from "@/components/session-workspace";

export function generateStaticParams() {
  return [{ id: "demo" }];
}

interface SessionPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ title?: string | string[] }>;
}

export default async function SessionPage({
  params,
  searchParams,
}: SessionPageProps) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const titleValue = resolvedSearchParams?.title;
  const seedTitle = typeof titleValue === "string" ? titleValue : null;

  return <SessionWorkspace key={`${id}:${seedTitle ?? ""}`} sessionId={id} seedTitle={seedTitle} />;
}
