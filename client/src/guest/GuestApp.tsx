import { useEffect, useMemo, useRef, useState } from "react";
import { API, WS_URL } from "../common/net";
import type { TableRecord, MenuItem, OrderRecord, BookingRecord, WebSocketPayload } from "../common/types";

const CATS = ["Starters", "Main Course", "Pizza", "Pasta", "Indian", "Chinese", "Desserts", "Beverages", "Special Menu"];
const AFTER = (...s: string[]) => s;
const STAGES: [string, string[]][] = [
  ["Order Confirmed", AFTER("ORDER_PLACED", "KITCHEN_QUEUED", "PREPARING", "FOOD_READY", "BEING_SERVED", "DELIVERED", "COMPLETED")],
  ["Sent to Kitchen", AFTER("KITCHEN_QUEUED", "PREPARING", "FOOD_READY", "BEING_SERVED", "DELIVERED", "COMPLETED")],
  ["Preparing", AFTER("FOOD_READY", "BEING_SERVED", "DELIVERED", "COMPLETED")],
  ["Food Ready", AFTER("BEING_SERVED", "DELIVERED", "COMPLETED")],
  ["Being Served", AFTER("DELIVERED", "COMPLETED")],
  ["Completed", AFTER("COMPLETED")],
];
const today = () => new Date().toISOString().slice(0, 10);
const btn = "w-full py-3 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-black font-bold uppercase text-xs tracking-wider rounded-xl transition";
const field = "w-full bg-black/60 border border-white/20 p-3 rounded-xl text-white outline-none focus:border-amber-400 text-sm";

export default function GuestApp() {
  const [step, setStep] = useState<"BOOKING" | "MENU" | "TRACKER">("BOOKING");
  const [tables, setTables] = useState<TableRecord[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cat, setCat] = useState(CATS[0]);
  const [guestName, setGuestName] = useState("");
  const [date, setDate] = useState(today());
  const [time, setTime] = useState("20:00");
  const [party, setParty] = useState(2);
  const [tableId, setTableId] = useState("");
  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [error, setError] = useState("");
  const [paid, setPaid] = useState(false);
  const orderIdRef = useRef<string | null>(null);
  orderIdRef.current = order?.orderId ?? null;

  const loadAvailability = async () => {
    try {
      const r = await fetch(`${API}/api/availability?date=${date}&time=${time}&partySize=${party}`);
      const d = await r.json();
      setTables(d.tables);
    } catch { setError("Could not reach the restaurant server."); }
  };
  useEffect(() => { void loadAvailability(); }, [date, time, party]);
  useEffect(() => { fetch(`${API}/api/menu`).then(r => r.json()).then(d => setMenu(d.menu)).catch(() => setError("Could not load the menu.")); }, []);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    ws.onmessage = e => {
      const p: WebSocketPayload = JSON.parse(e.data);
      if ((p.type === "ORDER_STATUS_UPDATED") && p.data.orderId === orderIdRef.current) setOrder(p.data);
      if (p.type === "TABLE_STATE_CHANGED" || p.type === "INITIAL_STATE") void loadAvailability();
    };
    return () => ws.close();
  }, [date, time, party]);

  const post = async (path: string, body: object) => {
    setError("");
    try {
      const r = await fetch(`${API}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || "Request failed.");
      return d;
    } catch (e) { setError(e instanceof Error ? e.message : "Could not reach the restaurant server."); return null; }
  };

  const book = async () => {
    if (!guestName.trim()) return setError("Enter your name to book.");
    if (!tableId) return setError("Select a table on the floor plan.");
    const d = await post("/api/bookings", { guestName, tableId, date, time, partySize: party, requiresParking: true });
    if (d) { setBooking(d.booking); await post("/api/checkin", { bookingId: d.booking.bookingId }); setStep("MENU"); }
  };
  const placeOrder = async () => {
    const items = Object.entries(cart).filter(([, q]) => q > 0).map(([id, quantity]) => ({ menuItem: { id }, quantity }));
    if (!items.length) return setError("Add at least one item.");
    const d = await post("/api/orders", { tableId, items });
    if (d) { setOrder(d.order); setStep("TRACKER"); }
  };
  const pay = async () => {
    if (!order) return;
    if (await post("/api/billing/pay", { tableId, orderId: order.orderId })) setPaid(true);
  };
  const reset = () => { setStep("BOOKING"); setOrder(null); setBooking(null); setCart({}); setTableId(""); setPaid(false); void loadAvailability(); };

  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const cartTotal = useMemo(() => menu.reduce((s, m) => s + m.price * (cart[m.id] || 0), 0), [menu, cart]);
  const set = (id: string, d: number) => setCart(p => ({ ...p, [id]: Math.max(0, (p[id] || 0) + d) }));
  const Floor = ({ ids, label }: { ids: string[]; label: string }) => (
    <div><div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-2">{label}</div>
      <div className="grid grid-cols-3 gap-2">{tables.filter(t => ids.includes(t.id)).map(t => {
        const ok = (t as any).free, sel = tableId === t.id;
        return <button key={t.id} disabled={!ok} onClick={() => setTableId(t.id)}
          className={`p-3 rounded-xl border text-center transition ${sel ? "bg-amber-400 text-black border-amber-300 font-bold" : ok ? "bg-black/40 border-emerald-500/40 text-emerald-400" : "bg-white/5 border-white/5 text-neutral-600 cursor-not-allowed"}`}>
          <div className="font-mono text-sm">{t.id}</div><div className="text-[10px]">{t.capacity} seats · {t.location}</div>
          <div className="text-[9px] uppercase mt-0.5">{ok ? "Available" : "Reserved"}</div></button>;
      })}</div></div>
  );

  return (
    <div className="w-full h-full max-w-5xl mx-auto p-4 md:p-8 overflow-y-auto text-neutral-100 pb-28">
      <div className="border-b border-white/10 pb-3 mb-5">
        <h1 className="text-xl font-bold text-amber-300 font-serif">Éclat & Ember — Guest Experience</h1>
        <p className="text-xs text-neutral-400">Book · Choose a table · Order · Track · Pay</p>
      </div>
      {error && <p role="alert" className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}

      {step === "BOOKING" && (
        <div className="grid md:grid-cols-2 gap-5 bg-[#0e1017] p-4 md:p-6 rounded-2xl border border-white/10">
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-amber-400 uppercase tracking-widest font-mono">1. Date, time & guests</h2>
            <input className={field} placeholder="Your name" value={guestName} onChange={e => setGuestName(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <input type="date" className={field} min={today()} value={date} onChange={e => { setDate(e.target.value); setTableId(""); }} />
              <input type="time" className={field} value={time} onChange={e => { setTime(e.target.value); setTableId(""); }} />
            </div>
            <select className={field} value={party} onChange={e => { setParty(+e.target.value); setTableId(""); }}>
              {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} guest{n > 1 ? "s" : ""}</option>)}
            </select>
            <div className="p-3 bg-white/5 rounded-xl text-xs">Selected table: <b className="text-amber-400">{tableId || "none"}</b></div>
            <button className={btn} onClick={book}>Book Table {tableId}</button>
          </div>
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-neutral-300 uppercase tracking-widest font-mono">2. Select table</h2>
            <Floor label="Dining area" ids={["T01", "T02", "T03", "T04", "T05", "T06"]} />
            <Floor label="VIP area" ids={["V01", "V02"]} />
          </div>
        </div>
      )}

      {step === "MENU" && booking && (
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
            Booking {booking.bookingId} confirmed · Table {tableId} · {booking.date} {booking.time} · {booking.partySize} guests{booking.parkingSlot ? ` · Parking ${booking.parkingSlot}` : ""}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">{CATS.map(c => <button key={c} onClick={() => setCat(c)} className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${cat === c ? "bg-amber-400 text-black font-bold" : "bg-white/5 text-neutral-300"}`}>{c}</button>)}</div>
          <div className="grid md:grid-cols-2 gap-3">{menu.filter(m => m.category === cat).map(m => (
            <div key={m.id} className="bg-[#0e1017] border border-white/10 p-4 rounded-2xl">
              <div className="flex justify-between gap-2"><h4 className="font-bold text-sm">{m.name}</h4><span className="font-mono text-amber-400 font-bold">₹{m.price}</span></div>
              <p className="text-xs text-neutral-400 mt-1">{m.description}</p>
              <div className="flex justify-between items-center mt-3">
                <span className={`text-[10px] px-2 py-0.5 rounded border ${m.isVeg ? "border-emerald-500 text-emerald-400" : "border-rose-500 text-rose-400"}`}>{m.isVeg ? "VEG" : "NON-VEG"}</span>
                {m.available === false ? <span className="text-xs text-neutral-500">Unavailable</span> :
                  <div className="flex items-center gap-2 bg-black/60 rounded-lg p-1 border border-white/10">
                    <button aria-label="Remove one" onClick={() => set(m.id, -1)} className="w-7 h-7">−</button>
                    <span className="text-xs font-mono w-4 text-center font-bold">{cart[m.id] || 0}</span>
                    <button aria-label="Add one" onClick={() => set(m.id, 1)} className="w-7 h-7">+</button>
                  </div>}
              </div>
            </div>))}</div>
          <div className="fixed bottom-0 inset-x-0 p-3 bg-[#0e1017] border-t border-white/10 flex items-center justify-between gap-3 max-w-5xl mx-auto">
            <span className="text-xs">{cartCount} items · <b className="text-amber-400">₹{cartTotal}</b></span>
            <button className={btn + " !w-auto px-6"} onClick={placeOrder} disabled={!cartCount}>Place Order</button>
          </div>
        </div>
      )}

      {step === "TRACKER" && order && (
        <div className="max-w-lg mx-auto bg-[#0e1017] border border-white/10 rounded-2xl p-5 space-y-4">
          <div className="text-center border-b border-white/10 pb-3">
            <div className="text-xs font-mono text-amber-400 uppercase tracking-widest">Live order status</div>
            <h2 className="text-xl font-bold mt-1">Order #{order.orderNo} · Table {order.tableId}</h2>
          </div>
          <ul className="space-y-2 font-mono text-xs">{STAGES.map(([label, done], i) => {
            const isDone = done.includes(order.status), prev = i === 0 || STAGES[i - 1][1].includes(order.status);
            const active = !isDone && prev;
            return <li key={label} className={`p-3 rounded-lg border flex justify-between ${isDone ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" : active ? "bg-amber-400/10 border-amber-400/30 text-amber-300 font-bold" : "bg-black/30 border-white/5 text-neutral-500"}`}>
              <span>{isDone ? "✓" : active ? "●" : "○"} {label}</span>
              <span>{label === "Preparing" && active ? `${order.prepProgress}% ${order.chef ?? ""}` : label === "Being Served" && order.server ? order.server : ""}</span></li>;
          })}</ul>
          {order.status === "FOOD_READY" && <p className="text-center text-emerald-300 text-sm">Your food is ready — a server is on the way.</p>}
          <div className="p-3 rounded-xl bg-black/50 border border-white/10 font-mono text-xs space-y-1">
            {order.items.map((it, i) => <div key={i} className="flex justify-between"><span>{it.quantity}× {it.menuItem.name}</span><span>₹{it.quantity * it.menuItem.price}</span></div>)}
            <div className="flex justify-between text-neutral-400"><span>GST 5% + service</span><span>₹{order.tax + order.serviceCharge}</span></div>
            <div className="border-t border-white/10 pt-2 flex justify-between font-bold text-amber-300"><span>Total</span><span>₹{order.total}</span></div>
          </div>
          {paid || order.status === "COMPLETED"
            ? <div className="space-y-2 text-center"><p className="text-emerald-300 text-sm">Payment received. Thank you, {order.guestName}!</p><button className={btn} onClick={reset}>Book another table</button></div>
            : <button className={btn + " !bg-emerald-400"} disabled={order.status !== "DELIVERED"} onClick={pay}>{order.status === "DELIVERED" ? `Pay ₹${order.total}` : "Bill available once food is served"}</button>}
        </div>
      )}
    </div>
  );
}
