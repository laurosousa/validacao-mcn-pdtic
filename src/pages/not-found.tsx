import { Link } from 'wouter';
import { ArrowRight, Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="admin-gate">
      <section className="gate-card">
        <div className="gate-icon"><Compass size={22} /></div>
        <span className="section-number">PÁGINA NÃO ENCONTRADA</span>
        <h1 className="serif">Este endereço não existe.</h1>
        <p>O link pode estar incompleto ou ter sido digitado errado. Volte à página inicial para participar da avaliação.</p>
        <Link href="/" className="button button-primary" data-testid="link-not-found-home">Ir para a página inicial <ArrowRight size={16} /></Link>
      </section>
    </main>
  );
}
