import type { ElementType } from "react"
import {
  Package, FolderKanban, Users, TrendingUp, LayoutDashboard, ShoppingCart,
  Boxes, Box, Warehouse, Truck, FileText, BarChart3, PieChart, LineChart,
  Settings, Settings2, Briefcase, Building, Building2, Store, CreditCard,
  DollarSign, Wallet, Calendar, CalendarRange, ClipboardList, Network,
  GitBranch, Layers, List, Target, Activity, Gauge, Zap, Bell, Mail,
  MessageSquare, Phone, Headphones, UserCog, ShieldCheck, Wrench, Cpu,
  Database, Server, Cloud, Globe, Home, Star, Heart, Tag, Tags, Archive,
  Clipboard, CheckSquare, Folder, FolderOpen,
} from "lucide-react"

// Mapa explícito dos ícones de módulo (o campo `icon` do registry é texto livre —
// nome de um componente lucide). Substitui o `import * as Icons from "lucide-react"`,
// que forçava o bundle a incluir os ~1500 ícones (namespace import não é tree-shakeable).
// Nomes fora deste mapa caem no fallback `Package` — degradação graciosa, sem quebra.
const MODULE_ICONS: Record<string, ElementType> = {
  Package, FolderKanban, Users, TrendingUp, LayoutDashboard, ShoppingCart,
  Boxes, Box, Warehouse, Truck, FileText, BarChart3, PieChart, LineChart,
  Settings, Settings2, Briefcase, Building, Building2, Store, CreditCard,
  DollarSign, Wallet, Calendar, CalendarRange, ClipboardList, Network,
  GitBranch, Layers, List, Target, Activity, Gauge, Zap, Bell, Mail,
  MessageSquare, Phone, Headphones, UserCog, ShieldCheck, Wrench, Cpu,
  Database, Server, Cloud, Globe, Home, Star, Heart, Tag, Tags, Archive,
  Clipboard, CheckSquare, Folder, FolderOpen,
}

export function resolveModuleIcon(name: string | null | undefined): ElementType {
  if (!name) return Package
  return MODULE_ICONS[name] ?? Package
}
