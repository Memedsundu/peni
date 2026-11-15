import type { Metadata } from "next";
import { CafePage } from "../cafe";
import { shareMetadata } from "../share";

type Props = { params: Promise<{ slug: string }> };

/** The café's name, place and cover photo, for search results and shared links. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return shareMetadata((await params).slug);
}

/** A café's own page (DS25, plan piece 14): one scroll from the café to its feed. */
export default async function Page({ params }: Props) {
  return <CafePage slug={(await params).slug} />;
}
