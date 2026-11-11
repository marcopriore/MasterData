/** Ocupa a área inteira do main (desfaz o padding dele) para o fundo do tema cobrir tudo. */
export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-valore -mx-8 -mb-8 -mt-[4.5rem] min-h-screen bg-background px-8 pb-8 pt-[4.5rem]">
      {children}
    </div>
  )
}
