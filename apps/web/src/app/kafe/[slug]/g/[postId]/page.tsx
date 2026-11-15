import type { Metadata } from "next";
import { CafePage } from "../../../cafe";
import { shareMetadata } from "../../../share";

type Props = { params: Promise<{ slug: string; postId: string }> };

/** The post's words and photo, so a shared link shows what it points at. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, postId } = await params;
  return shareMetadata(slug, postId);
}

/** One post's own page, the one a shared link opens: the café on top, that post alone below. */
export default async function Page({ params }: Props) {
  const { slug, postId } = await params;
  return <CafePage slug={slug} postId={postId} />;
}
