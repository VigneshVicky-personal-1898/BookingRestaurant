import express from "express";
import http from "http";
import cors from "cors";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import type { TableRecord, OrderRecord, ParkingSlot, BookingRecord, StaffMember, MenuItem, WebSocketPayload } from "../../client/src/common/types";

const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const T = (id: string, capacity: number, x: number, z: number, location: string): TableRecord =>
  ({ id, name: `Table ${id}`, capacity, state: "AVAILABLE", pos: { x, y: 0, z }, location, bookedSlots: [] });
export const tablesDB: TableRecord[] = [
  T("T01", 2, -6, 2, "Window"), T("T02", 4, 0, 2, "Main hall"), T("T03", 2, 6, 2, "Window"),
  T("T04", 4, -6, 7, "Main hall"), T("T05", 4, 0, 7, "Main hall"), T("T06", 6, 6, 7, "Garden side"),
  T("V01", 6, -5, -8, "VIP area"), T("V02", 4, 5, -8, "VIP area"),
];
export const parkingDB: ParkingSlot[] = ["P01", "P02", "P03", "P04", "P05", "P06"].map(slotId => ({ slotId, status: "EMPTY" as const }));
export const staffDB: StaffMember[] = [
  { id: "C1", name: "Chef Marcus", role: "CHEF", status: "IDLE" }, { id: "C2", name: "Chef Anika", role: "CHEF", status: "IDLE" },
  { id: "S1", name: "Server Ravi", role: "SERVER", status: "IDLE" }, { id: "S2", name: "Server Meera", role: "SERVER", status: "IDLE" },
  { id: "R1", name: "Receptionist Priya", role: "RECEPTION", status: "IDLE" },
];
export const bookingsDB: BookingRecord[] = [];
export const ordersDB: Map<string, OrderRecord> = new Map();
let orderSeq = 1044, bookingSeq = 500, guestSeq = 0, revenue = 0;

const m = (id: string, name: string, category: string, price: number, isVeg: boolean, description: string, prep = 5): MenuItem =>
  ({ id, name, category, price, isVeg, description, image: `/food/${id}.jpg`, prepTimeSeconds: prep, available: true });
export const MENU: MenuItem[] = [
  m("M01", "Paneer Tikka", "Starters", 260, true, "Charred cottage cheese marinated in yogurt and spices."),
  m("M02", "Chicken 65", "Starters", 240, false, "Crispy fried chicken tossed with curry leaves and chili.", 4),
  m("M03", "Butter Chicken", "Main Course", 360, false, "Tandoori chicken in a silky tomato-butter gravy."),
  m("M04", "Dal Makhani", "Main Course", 280, true, "Black lentils slow-cooked overnight with cream."),
  m("M05", "Margherita Pizza", "Pizza", 340, true, "Wood-fired base, San Marzano tomato, fresh mozzarella."),
  m("M06", "Pepperoni Pizza", "Pizza", 420, false, "Spicy pepperoni, mozzarella and oregano.", 6),
  m("M07", "Truffle Mushroom Pasta", "Pasta", 380, true, "Fettuccine with porcini and winter truffle."),
  m("M08", "Penne Arrabbiata", "Pasta", 310, true, "Penne in a fiery tomato and garlic sauce."),
  m("M09", "Chicken Dum Biryani", "Indian", 320, false, "Slow-cooked basmati rice with tender spiced chicken.", 7),
  m("M10", "Veg Biryani", "Indian", 270, true, "Fragrant basmati layered with seasonal vegetables.", 6),
  m("M11", "Hakka Noodles", "Chinese", 250, true, "Wok-tossed noodles with crunchy vegetables."),
  m("M12", "Chilli Chicken", "Chinese", 290, false, "Indo-Chinese chicken with peppers and spring onion."),
  m("M13", "Chocolate Lava Cake", "Desserts", 220, true, "Warm molten-centre cake with vanilla ice cream.", 4),
  m("M14", "Gulab Jamun", "Desserts", 150, true, "Soft milk dumplings in cardamom syrup.", 2),
  m("M15", "Chilled Coca Cola", "Beverages", 60, true, "330ml chilled can served with lemon.", 1),
  m("M16", "Fresh Lime Soda", "Beverages", 90, true, "Sweet, salted or mixed.", 1),
  m("M17", "Éclat Burger", "Special Menu", 390, false, "Chef's signature smoked patty, ember onions, house sauce.", 6),
  m("M18", "Ember Tomahawk Skewer", "Special Menu", 640, false, "Charcoal-grilled skewer with smoked chilli butter.", 8),
];

export function broadcast(payload: WebSocketPayload) {
  const data = JSON.stringify(payload);
  wss.clients.forEach(c => c.readyState === WebSocket.OPEN && c.send(data));
}
const stats = () => {
  const o = [...ordersDB.values()];
  const n = (s: string[]) => o.filter(x => s.includes(x.status)).length;
  return {
    tables: tablesDB.length, occupied: tablesDB.filter(t => !["AVAILABLE", "RESERVED"].includes(t.state)).length,
    available: tablesDB.filter(t => t.state === "AVAILABLE").length, reserved: tablesDB.filter(t => t.state === "RESERVED").length,
    orders: o.length, preparing: n(["ORDER_PLACED", "KITCHEN_QUEUED", "PREPARING"]), ready: n(["FOOD_READY", "BEING_SERVED"]),
    served: n(["DELIVERED", "COMPLETED"]), guests: bookingsDB.filter(b => b.status !== "COMPLETED").reduce((s, b) => s + b.partySize, 0), revenue,
  };
};
const snapshot = () => ({ tables: tablesDB, parking: parkingDB, orders: [...ordersDB.values()], staff: staffDB, bookings: bookingsDB, stats: stats() });
const push = () => broadcast({ type: "INITIAL_STATE", data: snapshot() });
wss.on("connection", ws => ws.send(JSON.stringify({ type: "INITIAL_STATE", data: snapshot() })));

function setTable(id: string, state: TableRecord["state"]) {
  const t = tablesDB.find(x => x.id === id); if (!t) return;
  t.state = state; broadcast({ type: "TABLE_STATE_CHANGED", data: { tableId: id, state } });
}
function update(o: OrderRecord, status: OrderRecord["status"]) {
  o.status = status; broadcast({ type: "ORDER_STATUS_UPDATED", data: o }); broadcast({ type: "STATS", data: stats() });
}
function assign(role: "CHEF" | "SERVER", task: string, orderNo = 0) {
  const pool = staffDB.filter(x => x.role === role);
  const rot = pool[orderNo % pool.length]; // alternate staff so two orders don't queue behind one person
  const s = rot.status === "IDLE" ? rot : pool.find(x => x.status === "IDLE") ?? rot;
  s.status = "BUSY"; s.task = task; broadcast({ type: "STAFF_UPDATED", data: staffDB }); return s;
}
const free = (s: StaffMember) => { s.status = "IDLE"; s.task = undefined; broadcast({ type: "STAFF_UPDATED", data: staffDB }); };

// Kitchen + service pipeline: Order -> Chef -> Pickup counter -> Server -> Table
function run(o: OrderRecord) {
  const prep = Math.max(...o.items.map(i => i.menuItem.prepTimeSeconds ?? 5)) * 1000;
  setTimeout(() => {
    update(o, "KITCHEN_QUEUED"); setTable(o.tableId, "ORDER_SENT");
    setTimeout(() => {
      const chef = assign("CHEF", `Cooking #${o.orderNo} for ${o.tableId}`, o.orderNo); o.chef = chef.name;
      update(o, "PREPARING"); setTable(o.tableId, "PREPARING");
      const tick = setInterval(() => { o.prepProgress = Math.min(100, o.prepProgress + 10); broadcast({ type: "ORDER_STATUS_UPDATED", data: o }); }, prep / 10);
      setTimeout(() => {
        clearInterval(tick); o.prepProgress = 100; free(chef);
        update(o, "FOOD_READY"); setTable(o.tableId, "FOOD_READY");
        setTimeout(() => {
          const srv = assign("SERVER", `Delivering #${o.orderNo} to ${o.tableId}`, o.orderNo); o.server = srv.name;
          update(o, "BEING_SERVED"); setTable(o.tableId, "SERVING");
          const tb = tablesDB.find(x => x.id === o.tableId)!;
          const walkMs = Math.round(((Math.hypot(tb.pos.x + 6.6, tb.pos.z + 6.9) * 1.4) / 1.7 + 2.5) * 1000); // matches the server's walk in the 3D scene
          setTimeout(() => { free(srv); update(o, "DELIVERED"); setTable(o.tableId, "DINING"); }, walkMs);
        }, 2000);
      }, prep);
    }, 2000);
  }, 1500);
}

app.get("/api/menu", (_q, r) => r.json({ success: true, menu: MENU }));
app.get("/api/state", (_q, r) => r.json({ success: true, ...snapshot() }));
app.get("/api/availability", (q, r) => {
  const { date, time, partySize } = q.query as Record<string, string>;
  const slot = `${date}T${time}`;
  r.json({ success: true, tables: tablesDB.map(t => ({ ...t, free: t.capacity >= Number(partySize || 1) && !t.bookedSlots!.includes(slot) })) });
});

app.post("/api/bookings", (req, res) => {
  const { tableId, guestName, date, time, partySize = 2, requiresParking } = req.body;
  const t = tablesDB.find(x => x.id === tableId);
  if (!t) return res.status(404).json({ success: false, error: "Table not found." });
  if (typeof guestName !== "string" || !guestName.trim()) return res.status(400).json({ success: false, error: "Guest name is required." });
  if (!date || !time) return res.status(400).json({ success: false, error: "Date and time are required." });
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > t.capacity) return res.status(400).json({ success: false, error: `Table ${t.id} seats up to ${t.capacity} guests.` });
  const slot = `${date}T${time}`;
  if (t.bookedSlots!.includes(slot)) return res.status(409).json({ success: false, error: "Table is no longer available for that time." });
  const sameNow = tablesDB.find(x => x.id === tableId && x.state !== "AVAILABLE");
  if (sameNow) return res.status(409).json({ success: false, error: "Table is no longer available." });
  t.bookedSlots!.push(slot);
  const booking: BookingRecord = { bookingId: `BK-${++bookingSeq}`, guestId: `G-${++guestSeq}`, guestName: guestName.trim(), tableId, date, time, partySize, status: "RESERVED" };
  if (requiresParking) {
    const p = parkingDB.find(x => x.status === "EMPTY");
    if (p) { p.status = "OCCUPIED"; p.assignedGuestName = booking.guestName; booking.parkingSlot = p.slotId; }
  }
  bookingsDB.push(booking); setTable(tableId, "RESERVED"); push();
  res.json({ success: true, booking });
});

app.post("/api/checkin", (req, res) => {
  const b = bookingsDB.find(x => x.bookingId === req.body.bookingId);
  if (!b) return res.status(404).json({ success: false, error: "Booking not found." });
  b.status = "CHECKED_IN"; push(); res.json({ success: true, booking: b });
});

app.post("/api/orders", (req, res) => {
  const { tableId, items } = req.body;
  const b = bookingsDB.find(x => x.tableId === tableId && x.status !== "COMPLETED");
  if (!b) return res.status(409).json({ success: false, error: "A confirmed reservation is required to order." });
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ success: false, error: "At least one order item is required." });
  const lines = [];
  for (const i of items) {
    const menuItem = MENU.find(x => x.id === i?.menuItem?.id);
    if (!menuItem || !menuItem.available || !Number.isInteger(i.quantity) || i.quantity < 1) return res.status(400).json({ success: false, error: "Invalid or unavailable menu item." });
    lines.push({ menuItem, quantity: i.quantity }); // price always taken from server menu
  }
  const subtotal = lines.reduce((s, i) => s + i.menuItem.price * i.quantity, 0);
  const tax = Math.round(subtotal * 0.05), serviceCharge = 50;
  const orderNo = ++orderSeq;
  const order: OrderRecord = { orderId: `ORD-${orderNo}`, orderNo, tableId, bookingId: b.bookingId, guestId: b.guestId, guestName: b.guestName,
    items: lines, subtotal, tax, serviceCharge, total: subtotal + tax + serviceCharge, status: "ORDER_PLACED", prepProgress: 0 };
  ordersDB.set(order.orderId, order); b.status = "CHECKED_IN";
  broadcast({ type: "ORDER_PLACED", data: order }); setTable(tableId, "ORDERING"); broadcast({ type: "STATS", data: stats() });
  run(order); res.json({ success: true, order });
});

app.post("/api/billing/request", (req, res) => {
  const o = ordersDB.get(req.body.orderId);
  if (!o) return res.status(404).json({ success: false, error: "Order not found." });
  o.billRequested = true; setTable(o.tableId, "BILL_REQUESTED"); broadcast({ type: "ORDER_STATUS_UPDATED", data: o }); res.json({ success: true });
});

app.post("/api/billing/pay", (req, res) => {
  const { tableId, orderId } = req.body;
  const o = ordersDB.get(orderId);
  if (!o || o.tableId !== tableId) return res.status(404).json({ success: false, error: "Order or table not found." });
  if (o.status === "COMPLETED") return res.json({ success: true });
  if (o.status !== "DELIVERED") return res.status(409).json({ success: false, error: "Food must be served before the bill can be paid." });
  const b = bookingsDB.find(x => x.bookingId === o.bookingId);
  update(o, "COMPLETED"); revenue += o.total;
  if (b) {
    b.status = "COMPLETED";
    const p = parkingDB.find(x => x.slotId === b.parkingSlot);
    if (p) { p.status = "EMPTY"; p.assignedGuestName = undefined; }
    const t = tablesDB.find(x => x.id === tableId); if (t) t.bookedSlots = t.bookedSlots!.filter(s => s !== `${b.date}T${b.time}`);
  }
  setTable(tableId, "AVAILABLE"); push(); res.json({ success: true });
});

app.get("/health", (_q, r) => r.send("ok"));

// Production: serve the built React client and fall back to index.html for /guest and /admin.
const dist = path.join(process.cwd(), "client", "dist");
app.use(express.static(dist));
app.get("*", (_q, r) => r.sendFile(path.join(dist, "index.html")));

const PORT = Number(process.env.PORT) || 4000;
server.listen(PORT, () => console.log(`Server listening on ${PORT}`));
