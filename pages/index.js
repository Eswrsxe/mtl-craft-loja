import dynamic from "next/dynamic";

// carregado só no cliente: usa window/sessionStorage e WebAuthn (navegador)
const MtlCraftSite = dynamic(() => import("../components/MtlCraftSite"), { ssr: false });

export default function Home() {
  return <MtlCraftSite />;
}
