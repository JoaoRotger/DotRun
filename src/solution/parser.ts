import * as path from 'path';

export type ProjectNode = { kind: 'project'; name: string; path: string };
export type FolderNode = { kind: 'folder'; name: string; children: SolutionNode[] };
export type SolutionNode = FolderNode | ProjectNode;

// Project type GUID Visual Studio uses for "Solution Folder" entries in .sln files
const FOLDER_TYPE_GUID = '2150E333-8FDC-42A3-9474-1A3956D46DE8';

export function parseSln(text: string, solutionDir: string): SolutionNode[] {
	const nodes = new Map<string, SolutionNode>();
	const projectLine = /^Project\("\{([^}]+)\}"\)\s*=\s*"([^"]*)",\s*"([^"]*)",\s*"\{([^}]+)\}"/gm;
	for (const [, typeGuid, name, relativePath, guid] of text.matchAll(projectLine)) {
		nodes.set(guid.toUpperCase(), typeGuid.toUpperCase() === FOLDER_TYPE_GUID
			? { kind: 'folder', name, children: [] }
			: { kind: 'project', name, path: resolvePath(solutionDir, relativePath) });
	}

	// Each NestedProjects line is "{child} = {folder it lives in}"
	const parents = new Map<string, string>();
	const section = /GlobalSection\(NestedProjects\)[^\n]*\n([\s\S]*?)EndGlobalSection/.exec(text);
	if (section) {
		for (const [, child, parent] of section[1].matchAll(/\{([^}]+)\}\s*=\s*\{([^}]+)\}/g)) {
			parents.set(child.toUpperCase(), parent.toUpperCase());
		}
	}

	const roots: SolutionNode[] = [];
	for (const [guid, node] of nodes) {
		const parent = nodes.get(parents.get(guid) ?? '');
		(parent?.kind === 'folder' ? parent.children : roots).push(node);
	}
	return sortNodes(roots);
}

export function parseSlnx(text: string, solutionDir: string): SolutionNode[] {
	const roots: SolutionNode[] = [];
	let current = roots;
	const withoutComments = text.replace(/<!--[\s\S]*?-->/g, '');
	const tag = /<(\/?)(Folder|Project)\b([^>]*?)(\/?)>/g;
	for (const [, closing, tagName, attributes, selfClosing] of withoutComments.matchAll(tag)) {
		if (tagName === 'Folder') {
			if (closing) {
				current = roots;
			} else {
				// .slnx folders don't nest: Name already holds the full path, e.g. "/src/web/"
				const folder = folderAtPath(roots, attribute(attributes, 'Name') ?? '');
				current = selfClosing ? roots : folder;
			}
		} else if (!closing) {
			const projectPath = attribute(attributes, 'Path');
			if (projectPath) {
				current.push({
					kind: 'project',
					name: fileNameWithoutExtension(projectPath),
					path: resolvePath(solutionDir, projectPath),
				});
			}
		}
	}
	return sortNodes(roots);
}

export function fileNameWithoutExtension(filePath: string): string {
	const fileName = filePath.replace(/\\/g, '/').split('/').pop() ?? filePath;
	return fileName.replace(/\.[^.]+$/, '');
}

// Folders first, then projects, alphabetically, like Solution Explorer
export function sortNodes(nodes: SolutionNode[]): SolutionNode[] {
	for (const node of nodes) {
		if (node.kind === 'folder') { sortNodes(node.children); }
	}
	return nodes.sort((a, b) =>
		a.kind !== b.kind ? (a.kind === 'folder' ? -1 : 1) : a.name.localeCompare(b.name));
}

// Projects in tree order (depth-first)
export function listProjects(nodes: SolutionNode[]): ProjectNode[] {
	return nodes.flatMap(node => node.kind === 'folder' ? listProjects(node.children) : [node]);
}

function folderAtPath(roots: SolutionNode[], name: string): SolutionNode[] {
	let current = roots;
	for (const segment of name.split('/').filter(Boolean)) {
		let folder = current.find((n): n is FolderNode => n.kind === 'folder' && n.name === segment);
		if (!folder) {
			folder = { kind: 'folder', name: segment, children: [] };
			current.push(folder);
		}
		current = folder.children;
	}
	return current;
}

function attribute(attributes: string, name: string): string | undefined {
	return new RegExp(`\\b${name}="([^"]*)"`).exec(attributes)?.[1];
}

// Solution files use "\" even outside Windows
function resolvePath(solutionDir: string, relativePath: string): string {
	return path.resolve(solutionDir, relativePath.replace(/\\/g, '/'));
}
