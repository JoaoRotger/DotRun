// Heuristic for picking a default startup project from the .csproj contents.
// Only looks at what is declared in the file; properties from Directory.Build.props are ignored.
export function isExecutableProject(csproj: string): boolean {
	// Test projects can declare OutputType Exe (xunit v3, MSTest runner) but are not runnable apps
	if (/<IsTestProject>\s*true\s*<\/IsTestProject>/i.test(csproj) || /Microsoft\.NET\.Test\.Sdk/i.test(csproj)) {
		return false;
	}

	// Legacy ASP.NET web application: OutputType is Library, the project type GUID marks it as web
	if (/<ProjectTypeGuids>[^<]*349C5851-65DF-11DA-9384-00065B846F21/i.test(csproj)) {
		return true;
	}

	const outputType = /<OutputType>\s*(\w+)\s*<\/OutputType>/i.exec(csproj)?.[1].toLowerCase();
	if (outputType) {
		return outputType === 'exe' || outputType === 'winexe';
	}

	// These SDKs default to Exe without declaring OutputType
	return /Sdk="Microsoft\.NET\.Sdk\.(Web|Worker|BlazorWebAssembly)"/i.test(csproj);
}
