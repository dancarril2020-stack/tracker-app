export interface User {
  uid: string;
  email: string | null;
  role?: 'superadmin' | 'backoffice' | 'office' | 'driver' | 'supplier' | 'user';
  name?: string;
  tenantId?: string;
  active?: boolean;
}

export interface AuthContextType {
  currentUser: User | null;
  userRole: string | null;
  tenantId: string | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<any>;
  logout: () => Promise<void>;
  registerUser: (email: string, password: string, role: string, name: string) => Promise<void>;
}

export interface RecordItem {
  id: string;
  type: 'pickup' | 'delivery' | 'warehouse';
  status: string;
  supplierId?: string;
  supplierName?: string;
  tenantId?: string;
  recipient?: string;
  address?: string;
  quantity?: number | string;
  volumen?: string;
  reembolso?: number | string;
  supplierReference?: string;
  remittance?: string;
  createdAt: string;
  date?: string;
  assignedDriver?: string;
  scannedAtPickup?: string[];
  scannedAtLoad?: string[];
  comments?: string;
  imageUrl?: string;
}
