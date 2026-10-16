import * as path from 'path';

export type NoSolucao =
	| { tipo: 'pasta'; nome: string; filhos: NoSolucao[] }
	| { tipo: 'projeto'; nome: string; caminho: string };

// Tipo usado pelo Visual Studio para "Solution Folder" no .sln
const GUID_PASTA = '2150E333-8FDC-42A3-9474-1A3956D46DE8';

export function parseSln(texto: string, dirSolucao: string): NoSolucao[] {
	const nos = new Map<string, NoSolucao>();
	const reProjeto = /^Project\("\{([^}]+)\}"\)\s*=\s*"([^"]*)",\s*"([^"]*)",\s*"\{([^}]+)\}"/gm;
	for (const [, tipo, nome, caminho, guid] of texto.matchAll(reProjeto)) {
		nos.set(guid.toUpperCase(), tipo.toUpperCase() === GUID_PASTA
			? { tipo: 'pasta', nome, filhos: [] }
			: { tipo: 'projeto', nome, caminho: resolver(dirSolucao, caminho) });
	}

	// Cada linha de NestedProjects é "{filho} = {pasta onde ele fica}"
	const pais = new Map<string, string>();
	const secao = /GlobalSection\(NestedProjects\)[^\n]*\n([\s\S]*?)EndGlobalSection/.exec(texto);
	if (secao) {
		for (const [, filho, pai] of secao[1].matchAll(/\{([^}]+)\}\s*=\s*\{([^}]+)\}/g)) {
			pais.set(filho.toUpperCase(), pai.toUpperCase());
		}
	}

	const raiz: NoSolucao[] = [];
	for (const [guid, no] of nos) {
		const pai = nos.get(pais.get(guid) ?? '');
		(pai?.tipo === 'pasta' ? pai.filhos : raiz).push(no);
	}
	return ordenar(raiz);
}

export function parseSlnx(texto: string, dirSolucao: string): NoSolucao[] {
	const raiz: NoSolucao[] = [];
	let atual = raiz;
	const semComentarios = texto.replace(/<!--[\s\S]*?-->/g, '');
	const reTag = /<(\/?)(Folder|Project)\b([^>]*?)(\/?)>/g;
	for (const [, fecha, tag, atributos, autoFecha] of semComentarios.matchAll(reTag)) {
		if (tag === 'Folder') {
			// No .slnx as pastas não se aninham: o Name já traz o caminho completo, ex. "/src/web/"
			if (fecha) {
				atual = raiz;
			} else {
				const pasta = pastaPorCaminho(raiz, atributo(atributos, 'Name') ?? '');
				atual = autoFecha ? raiz : pasta;
			}
		} else if (!fecha) {
			const caminho = atributo(atributos, 'Path');
			if (caminho) {
				atual.push({ tipo: 'projeto', nome: nomeSemExtensao(caminho), caminho: resolver(dirSolucao, caminho) });
			}
		}
	}
	return ordenar(raiz);
}

export function nomeSemExtensao(caminho: string): string {
	const arquivo = caminho.replace(/\\/g, '/').split('/').pop() ?? caminho;
	return arquivo.replace(/\.[^.]+$/, '');
}

// Pastas primeiro, depois projetos, em ordem alfabética, como no Solution Explorer
export function ordenar(nos: NoSolucao[]): NoSolucao[] {
	for (const no of nos) {
		if (no.tipo === 'pasta') { ordenar(no.filhos); }
	}
	return nos.sort((a, b) =>
		a.tipo !== b.tipo ? (a.tipo === 'pasta' ? -1 : 1) : a.nome.localeCompare(b.nome));
}

export function contarProjetos(nos: NoSolucao[]): number {
	return nos.reduce((n, no) => n + (no.tipo === 'pasta' ? contarProjetos(no.filhos) : 1), 0);
}

function pastaPorCaminho(raiz: NoSolucao[], nome: string): NoSolucao[] {
	let atual = raiz;
	for (const parte of nome.split('/').filter(Boolean)) {
		let pasta = atual.find((n): n is Extract<NoSolucao, { tipo: 'pasta' }> =>
			n.tipo === 'pasta' && n.nome === parte);
		if (!pasta) {
			pasta = { tipo: 'pasta', nome: parte, filhos: [] };
			atual.push(pasta);
		}
		atual = pasta.filhos;
	}
	return atual;
}

function atributo(atributos: string, nome: string): string | undefined {
	return new RegExp(`\\b${nome}="([^"]*)"`).exec(atributos)?.[1];
}

// Caminhos do .sln usam "\" mesmo fora do Windows
function resolver(dirSolucao: string, caminho: string): string {
	return path.resolve(dirSolucao, caminho.replace(/\\/g, '/'));
}
