import { Outlet } from "react-router-dom"

export default function RtdLayout() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
      <Outlet />
    </div>
  )
}
