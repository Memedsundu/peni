import { StaffPanel } from "@/components/staff-panel";

export default async function StaffPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <StaffPanel slug={slug} />;
}
