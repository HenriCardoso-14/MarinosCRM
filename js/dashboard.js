document.addEventListener('DOMContentLoaded', async () => {
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('current-date').textContent = new Date().toLocaleDateString('pt-BR', dateOptions);

    await loadDashboardData();
});

async function loadDashboardData() {
    try {
        const today = new Date();
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
        const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
        
        // 1. Clientes Ativos
        // Ativo = (Assinante Ativo) + (Não-assinante com corte nos últimos 30 dias)
        const { data: assinaturasAtivas, error: errAss } = await db.from('assinaturas').select('cliente_id').eq('situacao', 'Ativo');
        if (errAss) throw errAss;
        
        const assinantesIds = assinaturasAtivas.map(a => a.cliente_id);
        const uniqueAssinantes = new Set(assinantesIds).size;

        const thirtyDaysAgo = new Date(today.setDate(today.getDate() - 30)).toISOString().split('T')[0];
        const { data: cortesRecentes, error: errorCortesRecentes } = await db
            .from('cortes')
            .select('cliente_id')
            .gte('data', thirtyDaysAgo);
        
        if (errorCortesRecentes) throw errorCortesRecentes;
        
        const recentesNaoAssinantes = cortesRecentes
            .map(c => c.cliente_id)
            .filter(id => id && !assinantesIds.includes(id));
            
        const uniqueRecentesNaoAssinantes = new Set(recentesNaoAssinantes).size;
        
        document.getElementById('total-clientes-ativos').textContent = uniqueAssinantes + uniqueRecentesNaoAssinantes;

        // 2. Assinaturas Ativas
        const { count: countAssinaturas, error: errorAssinaturas } = await db
            .from('assinaturas')
            .select('*', { count: 'exact', head: true })
            .eq('situacao', 'Ativo');
        
        if (errorAssinaturas) throw errorAssinaturas;
        document.getElementById('total-assinaturas').textContent = countAssinaturas || 0;

        // 3. Cortes no Mês
        const { count: countCortesMes, error: errorCortesMes } = await db
            .from('cortes')
            .select('*', { count: 'exact', head: true })
            .gte('data', firstDayOfMonth)
            .lte('data', lastDayOfMonth);
        
        if (errorCortesMes) throw errorCortesMes;
        document.getElementById('total-cortes-mes').textContent = countCortesMes || 0;

        // 4. Faturamento do Mês
        const { data: movimentacoesMes, error: errorMovs } = await db
            .from('movimentacoes')
            .select('valor, categoria')
            .eq('tipo', 'Entrada')
            .gte('data', firstDayOfMonth)
            .lte('data', lastDayOfMonth);
            
        if (errorMovs) throw errorMovs;
        
        const faturamentoTotal = movimentacoesMes.reduce((acc, mov) => acc + parseFloat(mov.valor), 0);
        document.getElementById('faturamento-mes').textContent = formatCurrency(faturamentoTotal);

        renderVencimentos();
        renderFaturamentoChart(movimentacoesMes);

    } catch (error) {
        console.error("Erro ao carregar dashboard:", error);
        showToast("Erro ao carregar dados do dashboard.", "danger");
    }
}

async function renderVencimentos() {
    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);
    
    const formatYMD = (d) => {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    const todayStr = formatYMD(today);
    const nextWeekStr = formatYMD(nextWeek);

    const { data: vencimentos, error } = await db
        .from('assinaturas')
        .select(`
            id,
            data_vencimento,
            clientes (nome, telefone)
        `)
        .eq('situacao', 'Ativo')
        .gte('data_vencimento', todayStr)
        .lte('data_vencimento', nextWeekStr)
        .order('data_vencimento', { ascending: true });

    if (error) {
        console.error(error);
        return;
    }

    const container = document.getElementById('vencimentos-list');
    
    if (!vencimentos || vencimentos.length === 0) {
        container.innerHTML = `<div class="text-center text-muted py-4"><i class="fa-solid fa-check-circle fs-3 mb-2"></i><br>Nenhuma assinatura vencendo.</div>`;
        return;
    }

    container.innerHTML = vencimentos.map(v => `
        <div class="d-flex justify-content-between align-items-center p-3 rounded" style="background: rgba(255,255,255,0.05); border: 1px solid var(--glass-border);">
            <div>
                <div class="fw-bold">${v.clientes.nome}</div>
                <div class="text-danger small">Vence: ${formatDate(v.data_vencimento)}</div>
            </div>
            <a href="${getWhatsAppLink(v.clientes.telefone)}" target="_blank" class="btn btn-sm btn-glass text-success" title="Cobrar no WhatsApp">
                <i class="fa-brands fa-whatsapp fs-5"></i>
            </a>
        </div>
    `).join('');
}

function renderFaturamentoChart(movimentacoes) {
    const ctx = document.getElementById('faturamentoChart').getContext('2d');
    
    let totalAssinatura = 0;
    let totalAvulso = 0;
    let totalProdutos = 0;

    movimentacoes.forEach(m => {
        if (m.categoria === 'Assinatura') totalAssinatura += parseFloat(m.valor);
        else if (m.categoria === 'Produto') totalProdutos += parseFloat(m.valor);
        else totalAvulso += parseFloat(m.valor); // Cortes avulsos e outros
    });

    // Se tudo for zero, mostra um estado vazio
    if(totalAssinatura === 0 && totalAvulso === 0 && totalProdutos === 0) {
        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Sem dados'],
                datasets: [{ data: [1], backgroundColor: ['rgba(255,255,255,0.1)'], borderWidth: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
        return;
    }

    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Assinaturas', 'Cortes Avulsos', 'Produtos'],
            datasets: [{
                data: [totalAssinatura, totalAvulso, totalProdutos],
                backgroundColor: [
                    '#d4af37', // Accent
                    'rgba(255, 255, 255, 0.8)',
                    '#10b981' // Success
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#e2e8f0', padding: 20 }
                }
            },
            cutout: '75%'
        }
    });
}
