import * as RadixTooltip from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

type Props = {
  content: ReactNode;
  children: ReactNode;
  side?: RadixTooltip.TooltipContentProps["side"];
};

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <RadixTooltip.Provider delayDuration={250} skipDelayDuration={100}>{children}</RadixTooltip.Provider>;
}

export default function Tooltip({ content, children, side = "top" }: Props) {
  if (!content) return <>{children}</>;
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content className="tooltip-content" side={side} sideOffset={6} collisionPadding={8}>
          {content}
          <RadixTooltip.Arrow className="tooltip-arrow" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
