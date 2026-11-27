import { authRequest } from "@/lib/api";

export type Membership = { active: boolean; expiresAt: string | null; remainingVideoSeconds: number };
export type RechargeGoods = { goodsId: number; name: string; type: "MEMBERSHIP" | "VIDEO"; price: number; months: number; videoSeconds: number; sort: number };
export type RechargeOrder = { orderNo: string; status: number; goodsName: string; amountCents: number; months: number; videoSeconds: number; payType: "ALIPAY" | "WECHATPAY" };
export type Payment = { orderNo: string; order: RechargeOrder; qrCodeContent: string; returnUrl: string; expiresAt: string };

export async function fetchMembership(signal?: AbortSignal) {
  const result = await authRequest<Membership>("/billing/v1/membership", { signal });
  if (!result.status) throw new Error(result.message || "读取会员信息失败");
  return result.data;
}
export async function fetchRechargeGoods(signal?: AbortSignal) {
  const result = await authRequest<RechargeGoods[]>("/billing/v1/goods", { signal });
  if (!result.status) throw new Error(result.message || "读取充值套餐失败");
  return result.data;
}
export async function createRechargeOrder(goodsId: number) {
  const result = await authRequest<Payment>("/billing/v1/orders", { method: "POST", body: {
    goodsId, payType: "ALIPAY", returnUrl: new URL("/membership", window.location.origin).href
  } });
  if (!result.status) throw new Error(result.message || "创建充值订单失败");
  return result.data;
}
export async function fetchRechargeOrder(orderNo: string, signal?: AbortSignal) {
  const result = await authRequest<RechargeOrder>(`/billing/v1/order?orderNo=${encodeURIComponent(orderNo)}`, { signal });
  if (!result.status) throw new Error(result.message || "查询充值结果失败");
  return result.data;
}