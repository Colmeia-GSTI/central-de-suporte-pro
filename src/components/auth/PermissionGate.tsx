import {
  ReactNode,
  forwardRef,
  isValidElement,
  cloneElement,
} from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { Module, ModuleAction } from "@/lib/permissions";

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (value: T) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === "function") {
        ref(value);
      } else {
        try {
          (ref as React.MutableRefObject<T>).current = value;
        } catch {
          // ignore
        }
      }
    }
  };
}

interface PermissionGateProps {
  module: Module;
  action: ModuleAction;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Conditionally renders children based on user permissions.
 * Use this to hide/show UI elements based on module permissions.
 * 
 * Example:
 * ```tsx
 * <PermissionGate module="tickets" action="create">
 *   <Button>Novo Chamado</Button>
 * </PermissionGate>
 * ```
 */
export const PermissionGate = forwardRef<unknown, PermissionGateProps>(
  function PermissionGate({ module, action, children, fallback = null }, ref) {
    const { can } = usePermissions();

    if (!can(module, action)) {
      return <>{fallback}</>;
    }

    // Allow this component to be used inside Radix `asChild` trees without ref warnings.
    if (isValidElement(children)) {
      const childRef = (children as any).ref as React.Ref<unknown> | undefined;
      return cloneElement(children as any, {
        ref: mergeRefs(childRef, ref),
      });
    }

    return <span ref={ref as any}>{children}</span>;
  }
);

interface PermissionGateAnyProps {
  module: Module;
  actions: ModuleAction[];
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Renders children if user has ANY of the specified actions on the module.
 */
export const PermissionGateAny = forwardRef<unknown, PermissionGateAnyProps>(
  function PermissionGateAny({ module, actions, children, fallback = null }, ref) {
    const { canAny } = usePermissions();

    if (!canAny(module, actions)) {
      return <>{fallback}</>;
    }

    if (isValidElement(children)) {
      const childRef = (children as any).ref as React.Ref<unknown> | undefined;
      return cloneElement(children as any, {
        ref: mergeRefs(childRef, ref),
      });
    }

    return <span ref={ref as any}>{children}</span>;
  }
);

interface PermissionGateAllProps {
  module: Module;
  actions: ModuleAction[];
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Renders children only if user has ALL of the specified actions on the module.
 */
export const PermissionGateAll = forwardRef<unknown, PermissionGateAllProps>(
  function PermissionGateAll({ module, actions, children, fallback = null }, ref) {
    const { canAll } = usePermissions();

    if (!canAll(module, actions)) {
      return <>{fallback}</>;
    }

    if (isValidElement(children)) {
      const childRef = (children as any).ref as React.Ref<unknown> | undefined;
      return cloneElement(children as any, {
        ref: mergeRefs(childRef, ref),
      });
    }

    return <span ref={ref as any}>{children}</span>;
  }
);
