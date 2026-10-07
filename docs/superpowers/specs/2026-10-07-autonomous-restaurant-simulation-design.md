# Autonomous Restaurant Simulation Design

## Goal

Turn Éclat & Ember from a booking/order prototype with an admin 3D view into one continuously running restaurant simulation. Guests, staff, tables, orders, kitchen activity, billing, payments, parking, and revenue must describe the same live restaurant in both `/guest` and `/admin`.

This spec supersedes `2026-10-07-admin-3d-simulation-design.md` where that earlier screen-only scope conflicts with a server-authoritative autonomous simulation.

## Approved decisions

- The simulation runs on the server and owns operational state. The browser visualizes and interacts with that state; it must not independently invent reservations, orders, payments, or revenue.
- Payment is a demo settlement recorded by the existing backend. No real payment processor or external transaction is introduced.
- Automatic walk-in parties run while the server is running, alongside guest-created reservations. They can only claim currently available tables and join a waitlist when the floor has no suitable table.
- State is in memory for this demo. Restarting the server resets tables, parties, orders, revenue, activity, and simulation timers.

## User experience

### Guest

- A guest enters a name and party size, sees only tables that are available and large enough, and reserves one.
- The reservation is a real server record, becomes visible to the host and admin view, and starts the arrival/seating phase.
- The guest selects food from the shared server menu, places an order, follows kitchen preparation and delivery status, reviews a bill, and confirms demo payment.
- After payment, the table remains unavailable while cleaning is shown, then returns to available. Parking is released with the party.
- If no compatible table is free, the server returns a useful unavailable/waitlist response and the UI does not advance as though a reservation succeeded.

### Admin

- The `/admin` page uses the approved cinematic restaurant floor: reception, dining area, premium/VIP seating, bar, commercial kitchen, cooking/preparation stations, pass/pickup counter, and service areas.
- Existing table IDs and positions from the server remain authoritative. Mesh materials and labels reflect live table state; clicking a table or staff member opens an inspector.
- A live HUD shows occupancy, active orders, kitchen queue/stations, staff activity, waitlist, parking, simulation pause state, and settled revenue.
- The KDS shows server orders, item quantities, assigned station, status, and preparation progress. The inspector shows guest party, assigned staff, table lifecycle, order, and bill.
- An activity stream reports arrival, seating, order, kitchen, serving, billing, cleaning, waitlist, and system events.
- Camera presets, orbit, staff/guest follow, responsive KDS/inspector drawers, and user-activated ambient audio remain presentation controls.
- Admins can pause/resume autonomous arrivals and scheduled simulation steps. Pausing does not disable explicit guest booking, order submission, or demo-payment API requests; it pauses autonomous timers and walk-in generation.

## Shared server state and lifecycle

The server is the single source of truth for:

- Existing `TableRecord`, `OrderRecord`, and `ParkingSlot` values.
- `GuestParty` records: ID, guest name, party size, source (`RESERVATION` or `WALK_IN`), table ID, member count, current phase, world position/path, assigned waiter, and current order ID.
- `StaffRecord` records: ID, display name, role, world position/path, current task, busy state, and completed task count.
- Simulation pause/running state, bounded waitlist, settled revenue, and a bounded recent activity list.

Table lifecycle:

`AVAILABLE → RESERVED → ARRIVING → SEATED → ORDERING → ORDER_SENT → PREPARING → FOOD_READY → SERVING → DINING → BILL_REQUESTED → PAYMENT → CLEANING → AVAILABLE`

Not every source uses every step. Guest bookings enter at `RESERVED`; generated parties enter via `ARRIVING`. Guest orders reach `PAYMENT` when the guest requests the bill or submits demo payment; autonomous walk-ins are demo-settled by the simulation after dining. Only cleaning completion releases a table and its parking assignment.

Order lifecycle:

`ORDER_PLACED → KITCHEN_QUEUED → PREPARING → FOOD_READY → BEING_SERVED → DELIVERED → COMPLETED`

Each order references server-owned menu item IDs and prices. The server calculates subtotal, tax, service charge, and total; it does not trust client-supplied price data. A completed order contributes to revenue exactly once.

## Simulation engine

- Add a server-side `SimulationEngine` with explicit start, pause, resume, and stop lifecycle. It owns all timer handles and clears them on shutdown.
- On startup, initialize the shared in-memory restaurant snapshot, start the engine, and schedule automatic walk-ins at a configurable interval. Use a conservative initial 12-second cadence from the supplied reference; do not enqueue an unbounded stream when capacity is full.
- Select available tables that satisfy party size. Reservations are checked and claimed in the same server operation so an auto walk-in cannot take a reserved/occupied table.
- When no suitable table is open, add the walk-in party to a bounded waitlist and emit activity; when cleaning frees a compatible table, seat the oldest compatible waitlisted party.
- Assign reception, waiter, chef/station, and delivery tasks from server state. Busy staff retain their current task; additional tasks queue. Cooking stations have explicit queue/capacity so multiple table workflows can progress concurrently.
- The engine advances arrivals, walking, order tickets, preparation progress, serving, dining, demo billing/payment, cleaning, parking release, and table availability without depending on an admin browser being open.
- Auto walk-ins receive server-catalog menu items and auto-settle their demo bills so the restaurant remains visibly active. Guest reservations are never auto-charged; the guest flow controls their own order and demo-payment action.

## API and realtime contract

- Keep existing `/api/bookings`, `/api/orders`, and `/api/billing/pay` entry points, but route them through domain operations owned by the simulation service.
- Add explicit simulation controls for pause/resume, a server-backed manual walk-in action, and a read-only snapshot endpoint if useful for initial load/reconnect.
- Validate guest name, party size, available capacity, order item IDs, quantities, state transitions, table/order ownership, and payment eligibility server-side. Return clear 4xx errors for conflicts or invalid input.
- WebSocket connect sends one `INITIAL_STATE` snapshot including tables, parking, parties, staff, orders, waitlist, simulation status, revenue, and recent activity.
- Broadcast typed state-change events for table/party/staff/order/parking/waitlist/revenue/activity/simulation state. Send simulation positions at a bounded update rate; do not broadcast at display-frame frequency. The client interpolates between authoritative positions.
- Malformed or unknown client data must not crash the server or admin/guest clients. Reconnects receive a fresh snapshot.

## Client architecture

- Keep React responsible for all DOM UI. Keep Three.js responsible for scene objects and movement rendering.
- `AdminApp` consumes one typed realtime snapshot/update stream and derives HUD, KDS, activity feed, and inspector views from it.
- Extend `RestaurantScene` to render all operational zones, table states, staff, and guest parties from server IDs/state. Scene clicks select a table, staff member, or guest; camera follow uses authoritative agent positions.
- Update `GuestApp` to consume server table availability and the shared menu, include party size, display waitlist/conflict states, follow the lifecycle, and surface demo payment confirmation.
- Use one shared server menu definition for API validation and client display. Do not duplicate pricing as authority in the guest bundle.
- Keep the admin/Three.js bundle lazy-loaded so `/guest` does not download the 3D runtime.

## Failure handling and limits

- On WebSocket loss, retain last known display state, show disconnected status, and resync from a snapshot on reconnect.
- Server timer failures are logged and contained; one party/order task must not stop the whole simulation loop.
- If WebGL initialization fails, keep operation panels available and show a scene error.
- Bound event history and waitlist length to prevent unbounded memory growth; overflow produces a visible activity event rather than server failure.
- In-memory state intentionally resets on process restart; persistence, multi-process coordination, authentication, and real payment are out of scope.

## Verification criteria

- Typecheck and client/server builds complete.
- Concurrent actual bookings and automatic walk-ins never reserve the same table; incompatible party sizes never get assigned.
- Several parties can be in different lifecycle phases simultaneously; staff and stations do not accept conflicting assignments.
- KDS, guest tracker, table inspector, occupancy, parking, waitlist, and revenue agree with server state after every transition.
- Demo payment is idempotent, credits revenue once, and table/parking become available only after cleaning completes.
- Pausing prevents autonomous arrivals and timer-driven transitions; resuming continues them without duplicate timer chains.
- Leaving `/admin` cleans up rendering/audio resources without pausing or corrupting server simulation; `/guest` stays functional.
- WebSocket reconnect and malformed payload cases recover without crashing the app.

## Review note

This is a new integrated subsystem, not a visual-only port. The previous server currently holds tables/orders/parking in module-level arrays/maps, and its order/payment timers are embedded in route handlers. Implementation should extract those transitions into the engine/service before adding auto arrivals to avoid two competing state machines.
