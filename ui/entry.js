// Biblioteca visual do renderer, empacotada por `npm run build:ui` em src/renderer/assets/ui.js.
// Só traz o que a interface usa (Lucide: ícones por nome; Motion: animações). Não toca em conexão, rede, captura nem IPC.
import {
  createIcons, X, Copy, Check, Settings, Sun, Moon, Monitor, Star, Pencil, Trash2, ArrowRight, Clock, Laptop, ShieldCheck,
  ShieldAlert, Info, TriangleAlert, LoaderCircle, Wifi, WifiOff,
  MousePointerClick, MousePointer2, ExternalLink, RefreshCw, Paperclip, Scan, Minimize2, Maximize2,
  MessageSquare, Maximize, Keyboard, ChevronUp, ChevronDown, Power,
} from 'lucide';
import { animate } from 'motion';

const icons = {
  X, Copy, Check, Settings, Sun, Moon, Monitor, Star, Pencil, Trash2, ArrowRight, Clock, Laptop, ShieldCheck, ShieldAlert, Info, TriangleAlert, LoaderCircle, Wifi, WifiOff,
  MousePointerClick, MousePointer2, ExternalLink, RefreshCw, Paperclip, Scan, Minimize2, Maximize2,
  MessageSquare, Maximize, Keyboard, ChevronUp, ChevronDown, Power,
};

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

window.REA_UI = {
  // Entrada suave de uma tela ou painel (150 a 250 ms). Quem pediu menos movimento não vê nada.
  enter(el, { y = 0, duration = 0.2 } = {}) {
    if (!el || reduceMotion()) return;
    const frames = y ? { opacity: [0, 1], transform: ['translateY(' + y + 'px)', 'translateY(0px)'] } : { opacity: [0, 1] };
    animate(el, frames, { duration, ease: 'easeOut' });
  },
  // Troca <i data-lucide="copy"></i> pelo SVG. Chame de novo depois de montar DOM novo.
  icons(root) {
    createIcons({ icons, root: root || document, attrs: { 'aria-hidden': 'true', focusable: 'false' } });
  },
  animate,
};
