// Design system do Portal do Cliente, para usar o mesmo visual em outros módulos (ex.: Portfólio
// de Produtos). Os componentes continuam morando no Portal (fonte única); aqui só se reexporta,
// mais as peças de página de PageKit.tsx.
export {
  Card,
  DeltaLabel,
  FilterSelect,
  IconTile,
  Kpi,
  ProgressBar,
  ProgressRing,
  Segmented,
} from "@/modules/portal/portfolioUi"
export {
  DetailHeader,
  DetailTabs,
  KpiCount,
  KpiMilestone,
  KpiPerson,
  KpiRow,
  KpiText,
  type Crumb,
  type KpiTone,
  type MenuAction,
  type TabDef,
} from "@/modules/portal/DetailShell"
export {
  ChoiceCards,
  FieldError,
  FormSection,
  HowItWorks,
  Req,
  StepProgress,
  SummaryRow,
  type FormStep,
} from "@/modules/portal/portalForm"
export { Field, Notice, PageHeader, Pill, SectionCard, type PageCrumb, type Tone } from "./PageKit"
export { TABLE } from "./table"
