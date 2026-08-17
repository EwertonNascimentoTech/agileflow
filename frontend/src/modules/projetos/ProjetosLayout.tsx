import { Outlet } from "react-router-dom"

export default function ProjetosLayout() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
      <Outlet />
    </div>
  )
}

