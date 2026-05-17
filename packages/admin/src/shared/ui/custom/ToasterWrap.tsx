import { Toaster } from "@/shared/ui/sonner"
import type { ToasterProps } from "sonner"

function ToasterWrap({ ...props }: ToasterProps) {
  return (
    <Toaster
      toastOptions={{
        classNames: {
          toast: "border ![font-family:var(--font-sans)]",
          success: "bg-[#082019]! text-emerald-500! border-emerald-500/20!",
          error: "bg-[#370815]! text-rose-600! border-rose-600/20!",
          warning: "bg-[#3b2d08]! text-amber-400! border-amber-400/20!",
          info: "bg-[#0c1b3a]! text-blue-500! border-blue-500/20!",
          title: "font-bold!",
          description: "opacity-80!",
        },
      }}
      {...props}
    />
  )
}

export { ToasterWrap }
