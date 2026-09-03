import { createContext, useContext, type ReactNode } from "react";

interface WidgetSetupValue {
  openEdit: (widgetId: string) => void;
}

const Ctx = createContext<WidgetSetupValue | null>(null);

export function WidgetSetupProvider({
  openEdit,
  children,
}: {
  openEdit: (widgetId: string) => void;
  children: ReactNode;
}) {
  return <Ctx.Provider value={{ openEdit }}>{children}</Ctx.Provider>;
}

export function useWidgetSetup(): WidgetSetupValue | null {
  return useContext(Ctx);
}
