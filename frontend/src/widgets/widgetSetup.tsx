import { createContext, useContext, type ReactNode } from "react";

interface WidgetSetupValue {
  openEdit: (widgetId: string) => void;
  openAddIcon?: () => void;
}

const Ctx = createContext<WidgetSetupValue | null>(null);

export function WidgetSetupProvider({
  openEdit,
  openAddIcon,
  children,
}: {
  openEdit: (widgetId: string) => void;
  openAddIcon?: () => void;
  children: ReactNode;
}) {
  return (
    <Ctx.Provider value={{ openEdit, openAddIcon }}>{children}</Ctx.Provider>
  );
}

export function useWidgetSetup(): WidgetSetupValue | null {
  return useContext(Ctx);
}
