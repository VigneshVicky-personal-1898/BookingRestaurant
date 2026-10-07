export type TableState = "AVAILABLE" | "RESERVED" | "ORDERING" | "ORDER_SENT" | "PREPARING" | "FOOD_READY" | "SERVING" | "DINING" | "BILL_REQUESTED" | "PAYMENT" | "CLEANING";
export type OrderStatus = "ORDER_PLACED" | "KITCHEN_QUEUED" | "PREPARING" | "FOOD_READY" | "BEING_SERVED" | "DELIVERED" | "COMPLETED";

export interface MenuItem {
  id: string;
  name: string;
  category: string;
  price: number;
  description: string;
  isVeg: boolean;
  image: string;
  prepTimeSeconds?: number;
  available?: boolean;
}

export interface OrderRecord {
  orderId: string;
  tableId: string;
  guestName: string;
  items: { menuItem: MenuItem; quantity: number }[];
  subtotal: number;
  tax: number;
  serviceCharge: number;
  total: number;
  status: OrderStatus;
  prepProgress: number;
  orderNo?: number;
  bookingId?: string;
  guestId?: string;
  chef?: string;
  server?: string;
  billRequested?: boolean;
}

export interface BookingRecord {
  bookingId: string;
  guestId: string;
  guestName: string;
  tableId: string;
  date: string;
  time: string;
  partySize: number;
  status: "RESERVED" | "CHECKED_IN" | "COMPLETED";
  parkingSlot?: string;
}

export interface StaffMember {
  id: string;
  name: string;
  role: "CHEF" | "SERVER" | "RECEPTION";
  status: "IDLE" | "BUSY";
  task?: string;
}

export interface TableRecord {
  id: string;
  name: string;
  capacity: number;
  state: TableState;
  pos: { x: number; y: number; z: number };
  location?: string;
  bookedSlots?: string[];
}

export interface ParkingSlot {
  slotId: string;
  status: "EMPTY" | "OCCUPIED";
  assignedGuestName?: string;
}

export interface WebSocketPayload {
  type: string;
  data: any;
}
