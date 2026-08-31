export interface User {
  uid: string;
  email: string | null;
  role?: 'superadmin' | 'backoffice' | 'office' | 'driver' | 'supplier' | 'user';
  name?: string;
  supplierCompanyName?: string;
  tenantId?: string;
  active?: boolean;
}

export interface Recipient {
  id: string;
  name: string;
  address: string;
  zipCode: string;
  phone: string;
  hasBankAccount: boolean;
}

export interface Product {
  id: string;
  name: string;
  weightObs: string;
}

export interface AuthContextType {
  currentUser: User | null;
  userRole: string | null;
  tenantId: string | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<any>;
  logout: () => Promise<void>;
  registerUser: (email: string, password: string, role: string, name: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

export interface RecordItem {
  id: string;
  type: 'pickup' | 'delivery' | 'warehouse' | 'load' | 'delivery_failed';
  status: string;
  supplierId?: string;
  supplierName?: string;
  tenantId?: string;
  targetTenant?: string;
  recipient?: string;
  address?: string;
  zipCode?: string;
  phone?: string;
  quantity?: number | string;
  deliveredQuantity?: number | string;
  volumen?: string;
  reembolso?: number | string;
  expectedReembolso?: number | string;
  collectedValue?: number | string;
  supplierReference?: string;
  remittance?: string;
  createdAt: string;
  date?: string;
  assignedDriver?: string;
  driverId?: string;
  driverName?: string;
  assignedByName?: string;
  session?: string;
  scannedAtPickup?: string[];
  scannedAtLoad?: string[];
  comments?: string;
  imageUrl?: string;
  portes?: number | string;
  hasBankAccount?: boolean;
  portesPaymentType?: 'debidos' | 'pagados';
  observations?: string;
  failureReason?: string;
  linkedLoadId?: string;
  lastMileDriverId?: string;
  lastMileDriverName?: string;
  lastMileSession?: string;
  auditHistory?: any[];
}
