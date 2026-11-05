import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleArrowDown,
  CircleCheck,
  CircleExclamationPoint,
  CircleMinus,
  CirclePlus,
  CircleX,
  Clock,
  CloudOff,
  Disc,
  EighthNote,
  EighthNotes,
  Ellipsis,
  FastForward,
  Folder,
  FolderOpen,
  Heart,
  House,
  Info,
  Key,
  Library,
  List,
  ListMusic,
  Maximize2,
  Menu,
  Mic,
  MicOff,
  Minimize2,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Repeat,
  Search,
  Server,
  Settings,
  Share2,
  ShieldCheck,
  Shuffle,
  Signal,
  SkipBack,
  SkipForward,
  Smartphone,
  Square,
  Trash,
  TrendingUp,
  Type,
  Upload,
  User,
  Wifi,
  X,
  type LucideIcon,
} from 'lucide-react-native';

import { colors } from '../theme';

type IconEntry = {
  icon: LucideIcon;
  fill?: boolean;
  strokeWidth?: number;
};

const ICON_MAP = {
  // Actions & basic controls
  add: { icon: Plus },
  'add-circle': { icon: CirclePlus },
  'add-circle-outline': { icon: CirclePlus },
  close: { icon: X },
  'close-circle': { icon: CircleX },
  'close-circle-outline': { icon: CircleX },
  checkmark: { icon: Check },
  'checkmark-circle': { icon: CircleCheck },
  'checkmark-done-outline': { icon: CheckCheck },
  'remove-circle-outline': { icon: CircleMinus },
  'pencil-outline': { icon: Pencil },
  trash: { icon: Trash },
  'trash-outline': { icon: Trash },
  'trash-bin-outline': { icon: Trash },
  refresh: { icon: RefreshCw },
  'refresh-outline': { icon: RefreshCw },

  // Chevrons & navigation
  'chevron-back': { icon: ChevronLeft },
  'chevron-back-outline': { icon: ChevronLeft },
  'chevron-down': { icon: ChevronDown },
  'chevron-down-outline': { icon: ChevronDown },
  'chevron-forward': { icon: ChevronRight },
  'chevron-forward-outline': { icon: ChevronRight },
  'chevron-up': { icon: ChevronUp },
  'chevron-up-outline': { icon: ChevronUp },
  'arrow-back': { icon: ArrowLeft },
  'arrow-back-outline': { icon: ArrowLeft },
  'arrow-down': { icon: ArrowDown },
  'arrow-down-circle': { icon: CircleArrowDown },
  'arrow-down-circle-outline': { icon: CircleArrowDown },
  'arrow-forward': { icon: ArrowRight },
  'arrow-forward-outline': { icon: ArrowRight },

  // Tab bar (active vs outline)
  home: { icon: House, fill: true },
  'home-outline': { icon: House },
  search: { icon: Search, strokeWidth: 2.6 },
  'search-outline': { icon: Search },
  albums: { icon: Library, strokeWidth: 2.6 },
  'albums-outline': { icon: Library },

  // Media playback controls
  play: { icon: Play, fill: true },
  'play-outline': { icon: Play },
  pause: { icon: Pause, fill: true },
  'pause-outline': { icon: Pause },
  'play-skip-back': { icon: SkipBack, fill: true },
  'play-skip-forward': { icon: SkipForward, fill: true },
  'play-forward-outline': { icon: FastForward },
  stop: { icon: Square, fill: true },
  shuffle: { icon: Shuffle },
  repeat: { icon: Repeat },

  // Audio & music concepts
  'musical-note': { icon: EighthNote },
  'musical-notes': { icon: EighthNotes },
  'musical-notes-outline': { icon: EighthNotes },
  disc: { icon: Disc },
  'disc-outline': { icon: Disc },
  list: { icon: ListMusic },
  'list-outline': { icon: List },
  mic: { icon: Mic, fill: true },
  'mic-outline': { icon: Mic },
  'mic-off-outline': { icon: MicOff },

  // Favorites & user
  heart: { icon: Heart, fill: true },
  'heart-outline': { icon: Heart },
  person: { icon: User, fill: true },
  'person-outline': { icon: User },

  // System & device
  cellular: { icon: Signal },
  'cellular-outline': { icon: Signal },
  wifi: { icon: Wifi },
  'wifi-outline': { icon: Wifi },
  'phone-portrait': { icon: Smartphone },
  'phone-portrait-outline': { icon: Smartphone },
  'cloud-offline-outline': { icon: CloudOff },
  'cloud-upload-outline': { icon: Upload },
  'server-outline': { icon: Server },
  'settings-outline': { icon: Settings },
  settings: { icon: Settings },
  'key-outline': { icon: Key },
  'shield-checkmark-outline': { icon: ShieldCheck },
  'folder-outline': { icon: Folder },
  'folder-open-outline': { icon: FolderOpen },

  // Info & feedback
  'alert-circle': { icon: CircleExclamationPoint },
  'alert-circle-outline': { icon: CircleExclamationPoint },
  'information-circle': { icon: Info },
  'information-circle-outline': { icon: Info },
  pulse: { icon: Activity },

  // UI layout & chrome
  'ellipsis-horizontal': { icon: Ellipsis },
  'expand-outline': { icon: Maximize2 },
  'contract-outline': { icon: Minimize2 },
  'reorder-three': { icon: Menu },
  'time-outline': { icon: Clock },
  'share-outline': { icon: Share2 },
  'text-outline': { icon: Type },
  'trending-up': { icon: TrendingUp },
} as const satisfies Record<string, IconEntry>;

export type IconName = keyof typeof ICON_MAP;

export function Icon({
  name,
  size = 22,
  color = colors.text,
  strokeWidth,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const entry = ICON_MAP[name];
  if (!entry) return null;
  const Component = entry.icon;
  const sw = strokeWidth ?? ('strokeWidth' in entry ? entry.strokeWidth : 2);
  const fill = 'fill' in entry && entry.fill ? color : 'none';
  return <Component size={size} color={color} fill={fill} strokeWidth={sw} />;
}
