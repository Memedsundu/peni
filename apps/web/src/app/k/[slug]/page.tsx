import { CafeView } from "@/components/cafe-view";

export default async function CafePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CafeView slug={slug} />;
}
