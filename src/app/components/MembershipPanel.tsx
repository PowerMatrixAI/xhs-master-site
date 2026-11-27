"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, CircleCheck, CreditCard, Film, LoaderCircle, RefreshCw, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { createRechargeOrder, fetchMembership, fetchRechargeGoods, fetchRechargeOrder, type Membership, type Payment, type RechargeGoods } from "@/lib/billing";

function price(cents: number) {
  return (cents / 100).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function PaymentDialog({ payment, onClose }: { payment: Payment; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [message, setMessage] = useState("请用支付宝扫一扫，付款后自动确认。");
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const order = await fetchRechargeOrder(payment.orderNo, controller.signal);
        if (controller.signal.aborted) return;
        if (order.status === 1) {
          setMessage("充值成功，正在刷新会员信息…");
          window.location.assign(payment.returnUrl);
          return;
        }
        if (order.status === 2) {
          setClosed(true);
          setMessage("订单已关闭，请重新下单。");
          return;
        }
        setMessage("等待付款确认，请用支付宝扫描二维码。");
      } catch (error) {
        if (controller.signal.aborted) return;
        setMessage(error instanceof Error ? error.message : "查询失败，正在重试…");
      }
      if (Date.now() >= new Date(payment.expiresAt).getTime()) {
        setClosed(true);
        setMessage("二维码已过期，请重新下单。已付款的订单会在支付通知后到账。");
        return;
      }
      timer = setTimeout(poll, 2000);
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [payment]);
  return <dialog ref={dialogRef} onCancel={onClose} aria-labelledby="payment-title" className="w-[calc(100%-2rem)] max-w-md rounded-2xl border border-teal/20 bg-white p-6 text-ink shadow-panel backdrop:bg-ink/40">
    <div className="flex items-center justify-between gap-4"><h3 id="payment-title" className="text-lg font-semibold">支付宝扫码付款</h3><button type="button" className="icon-button" onClick={onClose} aria-label="关闭付款二维码"><X size={20} /></button></div>
    <div className="mt-5 text-center"><p className="font-medium">{payment.order.goodsName}</p><p className="mt-2 text-sm text-ink/65">{payment.order.months > 0 ? `会员 ${payment.order.months} 个月 · ` : ""}视频额度 {payment.order.videoSeconds} 秒</p><p className="mt-4 text-3xl font-semibold text-teal">¥{price(payment.order.amountCents)}</p>
      {!closed && <QRCodeSVG className="mx-auto mt-4 max-w-full" value={payment.qrCodeContent} size={240} marginSize={4} title="支付宝付款二维码" />}
      <p role="status" className="mt-4 text-sm leading-6">{message}</p><p className="mt-3 break-all text-xs text-ink/50">订单号：{payment.orderNo}</p>
    </div>
  </dialog>;
}

export function MembershipPanel() {
  const [membership, setMembership] = useState<Membership>();
  const [goods, setGoods] = useState<RechargeGoods[]>([]);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [buying, setBuying] = useState<number>();
  const busy = useRef(false);
  const [payment, setPayment] = useState<Payment>();
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    Promise.all([fetchMembership(controller.signal), fetchRechargeGoods(controller.signal)])
      .then(([status, products]) => { if (!controller.signal.aborted) { setMembership(status); setGoods(products); } })
      .catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "读取会员信息失败"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  async function buy(item: RechargeGoods) {
    if (busy.current) return;
    busy.current = true;
    setBuying(item.goodsId);
    setError("");
    try { setPayment(await createRechargeOrder(item.goodsId)); }
    catch (error) { setError(error instanceof Error ? error.message : "创建充值订单失败"); }
    finally { busy.current = false; setBuying(undefined); }
  }
  function products(type: RechargeGoods["type"]) {
    const items = goods.filter(item => item.type === type);
    if (!items.length) return <p className="text-sm text-ink/60">暂无上架套餐</p>;
    return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map(item => <article key={item.goodsId} className="flex flex-col rounded-xl border border-teal/15 bg-white/80 p-5">
      <h4 className="text-lg font-semibold">{item.name}</h4><p className="mt-4 text-3xl font-semibold text-teal">¥{price(item.price)}</p>
      <div className="my-5 flex-1 space-y-3 text-sm">{item.months > 0 && <p className="flex items-center gap-2"><CalendarDays size={17} className="text-teal" />会员有效期 {item.months} 个月</p>}<p className="flex items-center gap-2"><Film size={17} className="text-teal" />视频制作时长 {item.videoSeconds} 秒</p>{type === "VIDEO" && <p className="text-ink/55">随当前会员到期，充值优先抵扣欠额。</p>}</div>
      <button type="button" className="primary-button w-full" disabled={loading || buying !== undefined || (type === "VIDEO" && !membership?.active)} onClick={() => void buy(item)}>{buying === item.goodsId && <LoaderCircle size={17} className="animate-spin" />}{buying === item.goodsId ? "正在创建订单…" : type === "MEMBERSHIP" ? "充值会员" : "充值视频包"}</button>
    </article>)}</div>;
  }
  return <div className="space-y-5">
    <div className="panel flex flex-wrap items-center justify-between gap-4"><div><h2 className="section-title">会员中心</h2><p className="mt-2 text-sm text-ink/60">查看会员权益与视频额度，选择套餐后使用支付宝扫码充值。</p></div><button type="button" className="secondary-button" disabled={loading || buying !== undefined} onClick={() => setAttempt(value => value + 1)}><RefreshCw size={16} className={loading ? "animate-spin" : ""} />刷新权益</button></div>
    {error && <div className="panel text-sm text-coral" role="alert">{error}</div>}
    {loading ? <div className="panel flex items-center gap-2 text-sm text-ink/60"><LoaderCircle size={18} className="animate-spin" />正在读取会员信息…</div> : membership && <>
      <div className="grid gap-4 md:grid-cols-3"><div className="panel"><div className="flex items-center gap-2 text-sm text-ink/60"><CreditCard size={18} />会员状态</div><p className="mt-4 flex items-center gap-2 text-xl font-semibold">{membership.active && <CircleCheck size={20} className="text-teal" />}{membership.active ? "会员有效" : membership.expiresAt ? "会员已到期" : "尚未开通"}</p></div>
        <div className="panel"><div className="flex items-center gap-2 text-sm text-ink/60"><CalendarDays size={18} />会员到期时间</div><p className="mt-4 text-lg font-semibold">{membership.expiresAt ? new Date(membership.expiresAt).toLocaleString("zh-CN", { hour12: false }) : "尚未开通"}</p></div>
        <div className="panel"><div className="flex items-center gap-2 text-sm text-ink/60"><Film size={18} />视频包剩余秒数</div><p className={`mt-4 text-3xl font-semibold ${membership.remainingVideoSeconds <= 0 ? "text-coral" : "text-teal"}`}>{membership.remainingVideoSeconds.toLocaleString("zh-CN")} <span className="text-base">秒</span></p>{membership.remainingVideoSeconds < 0 && <p className="mt-2 text-sm text-coral">欠额 {Math.abs(membership.remainingVideoSeconds)} 秒，充值后优先抵扣。</p>}</div></div>
      <div className="panel"><h3 className="section-title">充值会员</h3><p className="mb-5 mt-2 text-sm text-ink/60">有效期内续费顺延会员期限；充值所含视频时长会先抵扣欠额。</p>{products("MEMBERSHIP")}</div>
      <div className="panel"><h3 className="section-title">充值视频包</h3><p className="mb-5 mt-2 text-sm text-ink/60">{membership.active ? "按最终成片时长扣除额度，不足 1 秒按 1 秒计。余额小于等于 0 时需充值后再制作。" : "请先开通有效会员，再充值视频包。"}</p>{products("VIDEO")}</div>
    </>}
    {payment && <PaymentDialog payment={payment} onClose={() => setPayment(undefined)} />}
  </div>;
}