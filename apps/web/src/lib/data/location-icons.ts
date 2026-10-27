import {
  BookOpen,
  Building2,
  Droplets,
  FlaskConical,
  Footprints,
  Fence,
  DoorClosed,
  Home,
  type LucideIcon,
} from "lucide-react";
import type { LocationType } from "@/lib/types";

export const LOCATION_ICONS: Record<LocationType, LucideIcon> = {
  Classroom: BookOpen,
  "Corridor & Stairs": Footprints,
  Toilet: Droplets,
  "Exterior Facade": Building2,
  "External Development": Fence,
  Roof: Home,
  "Other Room (Staff, Principal, Admin, Store etc.)": DoorClosed,
  "Lab (Wet/Dry/DLP)": FlaskConical,
};
