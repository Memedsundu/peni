import { OrderStatus } from "@/components/order-status";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderStatus id={id} />;
}
