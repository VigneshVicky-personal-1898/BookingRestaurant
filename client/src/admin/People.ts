import * as THREE from "three";
import type { BookingRecord, OrderRecord, StaffMember, TableRecord } from "../common/types";

type V3 = THREE.Vector3;
type Kind = "guest" | "server" | "chef" | "reception" | "attendant";
type Pose = "stand" | "sit" | "carry" | "cook" | "type";
interface Wp { p: V3; wait?: number; pose?: Pose; face?: number; then?: () => void }
interface Rig {
  root: THREE.Group; torso: THREE.Group; head: THREE.Group; tray: THREE.Group;
  thighs: THREE.Group[]; shins: THREE.Group[]; arms: THREE.Group[]; fores: THREE.Group[];
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const mats = new Map<string, THREE.MeshStandardMaterial>();
const mat = (c: number, r = 0.65) => {
  const k = `${c}-${r}`;
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: r }));
  return mats.get(k)!;
};
function rng(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SKIN = [0xf1c8a5, 0xe0ac82, 0xc68642, 0x8d5524, 0x6b4423, 0xffdbac];
const HAIR = [0x1a1209, 0x3b2314, 0x6b4a2b, 0x8a8a8a, 0xb5651d, 0x0d0d0d];
const TOPS = [0x2f5d8a, 0xb23a48, 0x3f7d58, 0xd9a441, 0x6b4e9b, 0x1f2933, 0xe8e2d5, 0x9c4f2f, 0x4a6670];
const BOTTOMS = [0x1c2330, 0x3a3226, 0x2d3a4f, 0x4b4b4b, 0x5a3e2b];

// ---------- Humanoid builder: jointed legs/arms, varied faces, hair, clothing ----------
function makeHuman(kind: Kind, seed: string): Rig {
  const R = rng(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(R() * a.length)];
  const skin = mat(pick(SKIN), 0.7);
  const female = kind === "reception" || (kind !== "chef" && R() < 0.5);
  const topC = kind === "chef" ? 0xf4f4f2 : kind === "server" ? 0xf2f2f2 : kind === "reception" ? 0x7a1f2b : kind === "attendant" ? 0x2d3a4f : pick(TOPS);
  const botC = kind === "chef" ? 0x2b2f3a : kind === "server" || kind === "reception" ? 0x15171c : kind === "attendant" ? 0x2d3a4f : pick(BOTTOMS);
  const top = mat(topC), bottom = mat(botC);
  const longSleeve = kind !== "guest" || R() < 0.5;

  const root = new THREE.Group();
  const joint = (parent: THREE.Object3D, x: number, y: number) => { const g = new THREE.Group(); g.position.set(x, y, 0); parent.add(g); return g; };
  const part = (g: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, y: number, z = 0, x = 0) => {
    const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = true; g.add(me); return me;
  };

  const thighs: THREE.Group[] = [], shins: THREE.Group[] = [], arms: THREE.Group[] = [], fores: THREE.Group[] = [];
  const torso = joint(root, 0, 0.95);
  for (const s of [-1, 1]) {
    const th = joint(root, s * 0.1, 0.95); part(th, new THREE.CylinderGeometry(0.08, 0.065, 0.46, 8), bottom, -0.23);
    const sh = joint(th, 0, -0.46); part(sh, new THREE.CylinderGeometry(0.062, 0.05, 0.46, 8), bottom, -0.23);
    part(sh, new THREE.BoxGeometry(0.1, 0.07, 0.22), mat(0x111111, 0.4), -0.47, 0.04);
    thighs.push(th); shins.push(sh);
    const arm = joint(torso, s * 0.25, 0.5); const sleeve = longSleeve ? top : skin;
    part(arm, new THREE.CylinderGeometry(0.052, 0.046, 0.3, 8), kind === "guest" && !longSleeve ? top : sleeve, -0.15);
    const fo = joint(arm, 0, -0.3); part(fo, new THREE.CylinderGeometry(0.044, 0.038, 0.27, 8), sleeve, -0.135);
    part(fo, new THREE.SphereGeometry(0.05, 8, 8), skin, -0.29);
    arms.push(arm); fores.push(fo);
  }
  part(torso, new THREE.BoxGeometry(0.38, 0.56, 0.22), top, 0.29);
  part(torso, new THREE.CylinderGeometry(0.04, 0.045, 0.08, 8), skin, 0.6);
  if (kind === "server") {
    part(torso, new THREE.BoxGeometry(0.4, 0.4, 0.235), mat(0x15171c), 0.36);
    part(torso, new THREE.BoxGeometry(0.34, 0.34, 0.02), mat(0xf5f5f5), 0.06, 0.125);
    part(torso, new THREE.BoxGeometry(0.07, 0.035, 0.02), mat(0xa0121f), 0.56, 0.12);
  }
  if (kind === "reception") part(torso, new THREE.BoxGeometry(0.06, 0.03, 0.02), mat(0xcaa54a, 0.3), 0.45, 0.115, 0.1);
  if (kind === "attendant") part(torso, new THREE.BoxGeometry(0.4, 0.45, 0.235), mat(0xf59e0b), 0.34);
  if (kind === "guest" && female && R() < 0.5) part(torso, new THREE.CylinderGeometry(0.2, 0.33, 0.38, 12), top, -0.04);

  const head = joint(torso, 0, 0.6);
  part(head, new THREE.SphereGeometry(0.115, 16, 12), skin, 0.1);
  for (const s of [-1, 1]) part(head, new THREE.SphereGeometry(0.014, 6, 6), mat(0x120d0a, 0.4), 0.12, 0.105, s * 0.04);
  part(head, new THREE.SphereGeometry(0.02, 6, 6), skin, 0.095, 0.115);
  const hair = mat(pick(HAIR), 0.8);
  if (kind === "chef") {
    part(head, new THREE.CylinderGeometry(0.12, 0.13, 0.12, 14), mat(0xffffff), 0.24);
    part(head, new THREE.SphereGeometry(0.15, 12, 8), mat(0xffffff), 0.33).scale.y = 0.7;
  } else {
    const style = female ? pick(["long", "bun", "short"]) : pick(["short", "short", "bald"]);
    if (style !== "bald") part(head, new THREE.SphereGeometry(0.125, 14, 10), hair, 0.15, -0.01).scale.set(1, 0.75, 1.05);
    if (style === "long") part(head, new THREE.BoxGeometry(0.25, 0.34, 0.07), hair, 0.0, -0.1);
    if (style === "bun") part(head, new THREE.SphereGeometry(0.06, 8, 8), hair, 0.26, -0.08);
  }
  const tray = new THREE.Group(); tray.position.set(0, 1.2, 0.4); tray.visible = false;
  part(tray, new THREE.CylinderGeometry(0.28, 0.28, 0.02, 20), mat(0xcfd3d8, 0.25), 0);
  root.add(tray);
  root.scale.setScalar((kind === "chef" ? 1.03 : 0.93) + R() * 0.1 + (female ? -0.03 : 0.02));
  return { root, torso, head, tray, thighs, shins, arms, fores };
}

function makePlate(n: number, seed: string) {
  const R = rng(seed), g = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.025, 18), mat(0xf7f5ef, 0.2)); g.add(plate);
  const foods = [0xb5651d, 0xc0392b, 0xe6b422, 0x5b8c3a, 0xf0e3c0];
  for (let i = 0; i < Math.min(n, 3); i++) {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.06 + R() * 0.03, 8, 6), mat(foods[Math.floor(R() * foods.length)], 0.8));
    f.position.set((i - 1) * 0.07, 0.05, (R() - 0.5) * 0.06); f.scale.y = 0.7; g.add(f);
  }
  return g;
}

function makeCar(seed: string) {
  const R = rng(seed), g = new THREE.Group();
  const body = mat([0x8b1e2d, 0x1f3a5f, 0xd9d9d9, 0x222222, 0x2e6b4f][Math.floor(R() * 5)], 0.35);
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = true; g.add(me); return me; };
  add(new THREE.BoxGeometry(1.8, 0.55, 3.8), body, 0, 0.55, 0);
  add(new THREE.BoxGeometry(1.5, 0.5, 1.9), mat(0x9fb8c8, 0.15), 0, 1.07, -0.1);
  for (const x of [-0.9, 0.9]) for (const z of [-1.2, 1.2]) add(new THREE.CylinderGeometry(0.33, 0.33, 0.25, 12), mat(0x0c0c0c), x, 0.33, z).rotation.z = Math.PI / 2;
  return g;
}

// ---------- Actor: waypoint walker + pose animation ----------
class Actor {
  rig: Rig; kind: Kind; key: string;
  queue: Wp[] = []; pose: Pose = "stand"; eating = false;
  wait = 0; delay = 0; moving = false; phase = Math.random() * 6; speed = 1.7; yaw = 0; seatedSince = 0;
  constructor(rig: Rig, kind: Kind, key: string) { this.rig = rig; this.kind = kind; this.key = key; }
  get obj() { return this.rig.root; }
  tail(): V3 { return this.queue.length ? this.queue[this.queue.length - 1].p : this.obj.position; }
  go(p: V3, o: Partial<Wp> = {}) { this.queue.push({ p, ...o }); return this; }
  walk(points: V3[], last: Partial<Wp> = {}) {
    points.forEach((p, i) => this.go(p, i === points.length - 1 ? last : {}));
    return this;
  }
  step(dt: number) {
    const o = this.obj.position;
    if (this.delay > 0) { this.delay -= dt; if (this.delay <= 0) this.obj.visible = true; return; }
    if (this.wait > 0) { this.wait -= dt; this.moving = false; }
    else if (this.queue.length) {
      const w = this.queue[0], dx = w.p.x - o.x, dz = w.p.z - o.z, d = Math.hypot(dx, dz);
      if (d < 0.06) {
        this.queue.shift(); o.x = w.p.x; o.z = w.p.z; this.moving = false;
        if (w.pose) this.pose = w.pose;
        if (w.face !== undefined) this.yaw = w.face;
        this.wait = w.wait ?? 0; w.then?.();
      } else {
        if (this.pose === "sit") this.pose = "stand";
        const s = Math.min(d, this.speed * dt); o.x += (dx / d) * s; o.z += (dz / d) * s;
        this.yaw = Math.atan2(dx, dz); this.moving = true; this.phase += dt * this.speed * 5.2;
      }
    } else this.moving = false;
    let dy = this.yaw - this.obj.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.obj.rotation.y += dy * Math.min(1, dt * 10);
  }
  animate(dt: number, t: number) {
    const k = 1 - Math.exp(-14 * dt), r = this.rig;
    const set = (o: THREE.Object3D, x: number) => { o.rotation.x += (x - o.rotation.x) * k; };
    const sit = this.pose === "sit", w = this.moving ? 1 : 0, s = Math.sin(this.phase);
    set(r.thighs[0], sit ? -1.5 : -s * 0.55 * w); set(r.thighs[1], sit ? -1.5 : s * 0.55 * w);
    set(r.shins[0], sit ? 1.5 : Math.max(0, s) * 0.7 * w); set(r.shins[1], sit ? 1.5 : Math.max(0, -s) * 0.7 * w);
    let a0 = s * 0.5 * w, a1 = -s * 0.5 * w, f0 = -0.1, f1 = -0.1;
    if (this.pose === "carry") { a0 = a1 = -1.15; f0 = f1 = -0.5; }
    else if (this.pose === "cook") { a0 = -0.6; f0 = -0.7; a1 = -0.9 + Math.sin(t * 7) * 0.25; f1 = -0.8; }
    else if (this.pose === "type") { a0 = a1 = -0.7; f0 = f1 = -0.8 + Math.sin(t * 5 + this.phase) * 0.1; }
    else if (sit) {
      a0 = -0.5; f0 = -0.9; a1 = -0.5; f1 = -0.9;
      if (this.eating) { const e = (Math.sin(t * 1.6 + this.phase) + 1) / 2; a1 = -0.5 - e * 0.6; f1 = -0.6 - e * 1.0; }
    }
    set(r.arms[0], a0); set(r.arms[1], a1); set(r.fores[0], f0); set(r.fores[1], f1);
    r.head.rotation.y = sit && !this.moving ? Math.sin(t * 0.7 + this.phase) * 0.3 : 0;
    r.tray.visible = this.pose === "carry";
    r.torso.scale.y = 1 + Math.sin(t * 2 + this.phase) * 0.01;
    this.obj.position.y += ((sit ? -0.36 : 0) - this.obj.position.y) * k;
  }
}

// ---------- Layout constants ----------
const PICK = V(-6.6, 0, -6.9), PLATE_SPOT = V(-7.6, 0, -6.4);
const STATIONS = [V(-13, 0, -6.6), V(-11, 0, -6.6), V(-9, 0, -6.6)];
const HOME_CHEF = [V(-12, 0, -6.2), V(-9.5, 0, -6.2)], HOME_SRV = [V(-3, 0, -4.5), V(3, 0, -4.5)];
const lane = (x: number) => (x < 0 ? -3 : 3);
const chairR = (t: TableRecord) => (t.id.startsWith("V") ? 1.45 : t.capacity >= 6 ? 1.32 : 1.05);
const slotX = (slot?: string) => (slot ? -10 + (parseInt(slot.slice(1)) - 1) * 4 : 0);

function seatOf(t: TableRecord, i: number) {
  const a = ((i % t.capacity) / t.capacity) * Math.PI * 2, r = chairR(t) + 0.65;
  return { p: V(t.pos.x + Math.cos(a) * r, 0, t.pos.z + Math.sin(a) * r), yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) };
}
function serviceOf(t: TableRecord) {
  const a = Math.PI / t.capacity, r = chairR(t) + 1.0;
  return { p: V(t.pos.x + Math.cos(a) * r, 0, t.pos.z + Math.sin(a) * r), yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) };
}
// Aisle-based routing so people walk between tables instead of through them.
function route(from: V3, to: V3): V3[] {
  const fz = from.z, tz = to.z, lf = lane(from.x), lt = lane(to.x);
  if (fz > 11 && tz > 11) return [to.clone()];
  if (fz > 11) return [V(lt * 0.85, 0, 14.5), V(lt, 0, 11), V(lt, 0, tz), to.clone()];
  if (tz > 11) return [V(lf, 0, fz), V(lf, 0, 11), V(lf * 0.85, 0, 14.5), to.clone()];
  const row = fz < -3 || tz < -3 ? -4.2 : 10.5;
  return [V(lf, 0, fz), V(lf, 0, row), V(lt, 0, row), V(lt, 0, tz), to.clone()];
}

interface Party { guests: Actor[]; car?: Actor; left: boolean; tableId: string; slot: number }

export interface PeopleData { bookings: BookingRecord[]; orders: OrderRecord[]; staff: StaffMember[] }

export class People {
  private scene: THREE.Scene; private tables = new Map<string, TableRecord>();
  private actors: Actor[] = []; private chefs: Actor[] = []; private servers: Actor[] = [];
  private parties = new Map<string, Party>(); private lastStatus = new Map<string, string>();
  private counterPlates = new Map<string, THREE.Group>(); private tablePlates = new Map<string, THREE.Group[]>();
  private first = true; private clock = 0; private names: { chefs: string[]; servers: string[] } = { chefs: [], servers: [] };
  lastGuest: Actor | null = null;

  constructor(scene: THREE.Scene, tables: TableRecord[]) {
    this.scene = scene;
    tables.forEach(t => this.tables.set(t.id, t));
    HOME_CHEF.forEach((p, i) => { const c = this.spawn("chef", `chef${i}`, p, Math.PI); this.chefs.push(c); });
    HOME_SRV.forEach((p, i) => { const s = this.spawn("server", `srv${i}`, p, 0); this.servers.push(s); });
    this.spawn("reception", "reception", V(0, 0, 11.6), 0).pose = "type";
    this.spawn("attendant", "attendant", V(-2, 0, 24), 0);
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(34, 12), mat(0x101114, 0.9));
    lot.rotation.x = -Math.PI / 2; lot.position.set(0, 0.01, 27); lot.receiveShadow = true; scene.add(lot);
    for (let i = 0; i < 6; i++) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 4.2), mat(0xcfd3d8)); line.rotation.x = -Math.PI / 2;
      line.position.set(-12 + i * 4, 0.02, 23.5); scene.add(line);
    }
  }
  private spawn(kind: Kind, seed: string, p: V3, yaw: number) {
    const a = new Actor(makeHuman(kind, seed), kind, seed);
    a.obj.position.copy(p); a.obj.rotation.y = a.yaw = yaw; this.scene.add(a.obj); this.actors.push(a); return a;
  }
  private byName(list: Actor[], role: "CHEF" | "SERVER", name?: string, staff: StaffMember[] = []) {
    const idx = staff.filter(s => s.role === role).findIndex(s => s.name === name);
    return list[idx >= 0 ? idx : 0];
  }

  follow(name: string): THREE.Object3D | null {
    if (name === "waiter-1") return this.servers[0].obj;
    if (name === "waiter-2") return this.servers[1].obj;
    if (name === "chef-1") return this.chefs[0].obj;
    if (name === "customer-active") return this.lastGuest?.obj ?? null;
    return null;
  }

  sync(d: PeopleData) {
    const first = this.first; this.first = false;
    for (const b of d.bookings) {
      const known = this.parties.get(b.bookingId);
      if (!known && b.status !== "COMPLETED") this.arrive(b, first);
      else if (known && b.status === "COMPLETED" && !known.left) this.depart(b.bookingId, known);
    }
    for (const o of d.orders) {
      const prev = this.lastStatus.get(o.orderId);
      if (prev === o.status) continue;
      this.lastStatus.set(o.orderId, o.status);
      const party = this.parties.get(o.bookingId ?? "");
      if (o.status === "DELIVERED") party?.guests.forEach(g => (g.eating = true));
      if (first) continue;
      const t = this.tables.get(o.tableId); if (!t) continue;
      if (o.status === "ORDER_PLACED") this.takeOrder(t, o.orderNo ?? 0);
      if (o.status === "PREPARING") this.cook(this.byName(this.chefs, "CHEF", o.chef, d.staff));
      if (o.status === "FOOD_READY") this.plate(this.byName(this.chefs, "CHEF", o.chef, d.staff), o);
      if (o.status === "BEING_SERVED") this.deliver(this.byName(this.servers, "SERVER", o.server, d.staff), o, t);
      if (o.status === "COMPLETED") this.clearTable(o.tableId);
    }
  }

  private arrive(b: BookingRecord, instant: boolean) {
    const t = this.tables.get(b.tableId); if (!t) return;
    const sx = slotX(b.parkingSlot), party: Party = { guests: [], left: false, tableId: b.tableId, slot: sx };
    if (!instant && b.parkingSlot) {
      const car = new Actor({ root: makeCar(b.bookingId) } as Rig, "guest", `car-${b.bookingId}`);
      car.obj.position.set(sx, 0, 33); car.speed = 6; car.yaw = car.obj.rotation.y = Math.PI;
      car.go(V(sx, 0, 23.5)); this.scene.add(car.obj); this.actors.push(car); party.car = car;
    }
    for (let i = 0; i < b.partySize; i++) {
      const g = new Actor(makeHuman("guest", `${b.guestId}-${i}`), "guest", `${b.bookingId}-${i}`);
      const seat = seatOf(t, i); g.speed = 1.4 + Math.random() * 0.4;
      if (instant) { g.obj.position.copy(seat.p); g.obj.position.y = -0.36; g.obj.rotation.y = g.yaw = seat.yaw; g.pose = "sit"; }
      else {
        const desk = V(i * 0.7 - (b.partySize - 1) * 0.35, 0, 15.6);
        g.obj.position.set(sx + 1.4, 0, 22.5); g.obj.visible = false; g.delay = b.parkingSlot ? 1.8 : 0.01;
        g.walk([V(sx + 1.4, 0, 18), desk], { wait: 2 + i * 0.3, face: Math.PI });
        g.walk(route(desk, seat.p), { pose: "sit", face: seat.yaw });
      }
      this.scene.add(g.obj); this.actors.push(g); party.guests.push(g); this.lastGuest = g;
    }
    this.parties.set(b.bookingId, party);
  }

  private depart(id: string, party: Party) {
    party.left = true;
    const t = this.tables.get(party.tableId)!; let remaining = party.guests.length;
    party.guests.forEach((g, i) => {
      g.eating = false;
      const seat = seatOf(t, i).p, exit = V(party.slot + 1.4, 0, 22.5);
      g.walk([...route(seat, V(0, 0, 16)), V(party.slot + 1.4, 0, 18), exit], {
        then: () => {
          this.remove(g);
          if (--remaining === 0 && party.car) party.car.go(V(party.slot, 0, 24)).go(V(party.slot, 0, 34), { then: () => this.remove(party.car!) });
        },
      });
    });
    void id;
  }
  private remove(a: Actor) { this.scene.remove(a.obj); this.actors = this.actors.filter(x => x !== a); }

  private takeOrder(t: TableRecord, orderNo: number) {
    // The other server (not the one the backend assigns to deliver) takes the order.
    const s = this.servers[(orderNo + 1) % this.servers.length], sv = serviceOf(t);
    s.walk(route(s.tail(), sv.p), { wait: 1.8, face: sv.yaw });
    s.walk(route(sv.p, PICK), { wait: 0.8, face: Math.PI });
    s.walk(route(PICK, HOME_SRV[this.servers.indexOf(s)]), { face: 0 });
  }
  private cook(c: Actor) {
    c.queue.length = 0; c.wait = 0;
    for (let round = 0; round < 3; round++) STATIONS.forEach(p => c.go(p, { pose: "cook", wait: 2, face: Math.PI }));
  }
  private plate(c: Actor, o: OrderRecord) {
    c.queue.length = 0; c.wait = 0; c.pose = "stand";
    c.go(PLATE_SPOT, { wait: 0.9, face: Math.PI, then: () => {
      const plate = makePlate(o.items.length, o.orderId); plate.position.set(-6.6, 1.2, -8.6);
      this.scene.add(plate); this.counterPlates.set(o.orderId, plate);
    } });
    c.go(HOME_CHEF[this.chefs.indexOf(c)], { pose: "stand", face: Math.PI });
  }
  private deliver(s: Actor, o: OrderRecord, t: TableRecord) {
    const sv = serviceOf(t), home = HOME_SRV[this.servers.indexOf(s)];
    s.walk(route(s.tail(), PICK), { wait: 0.8, face: Math.PI, then: () => {
      const cp = this.counterPlates.get(o.orderId); if (cp) { this.scene.remove(cp); this.counterPlates.delete(o.orderId); }
      const tp = makePlate(o.items.length, o.orderId); tp.position.set(0, 0.04, 0); s.rig.tray.add(tp); s.pose = "carry";
    } });
    s.walk(route(PICK, sv.p), { wait: 1.6, face: sv.yaw, then: () => {
      s.pose = "stand";
      while (s.rig.tray.children.length > 1) s.rig.tray.remove(s.rig.tray.children[1]);
      const list: THREE.Group[] = [];
      const n = Math.max(1, Math.min(o.items.length, t.capacity));
      for (let i = 0; i < n; i++) {
        const p = makePlate(1, `${o.orderId}${i}`), a = (i / n) * Math.PI * 2 + 0.4;
        p.position.set(t.pos.x + Math.cos(a) * 0.55, 1.2, t.pos.z + Math.sin(a) * 0.55); this.scene.add(p); list.push(p);
      }
      this.tablePlates.set(t.id, [...(this.tablePlates.get(t.id) ?? []), ...list]);
    } });
    s.walk(route(sv.p, home), { face: 0 });
  }
  private clearTable(id: string) {
    this.tablePlates.get(id)?.forEach(p => this.scene.remove(p)); this.tablePlates.delete(id);
  }

  update(dt: number) {
    dt = Math.min(dt, 0.05); this.clock += dt;
    for (const a of this.actors) { a.step(dt); if (a.rig.thighs) a.animate(dt, this.clock); }
  }
  dispose() {
    this.actors.forEach(a => this.scene.remove(a.obj));
    this.counterPlates.forEach(p => this.scene.remove(p)); this.tablePlates.forEach(l => l.forEach(p => this.scene.remove(p)));
    this.actors = []; this.parties.clear();
  }
  // test helper
  guestsOf(bookingId: string) { return this.parties.get(bookingId)?.guests ?? []; }
}
