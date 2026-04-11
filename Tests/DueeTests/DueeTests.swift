import Testing
@testable import Duee

@Test func customThemeNormalizationFallsBackForInvalidHex() async throws {
    let normalized = DueeColorThemeCatalog.normalizedCustomHexes(from: "FFF,XYZ123,,12345")
    #expect(normalized.count == DueeColorThemeCatalog.customInputColorCount)
    #expect(normalized[0] == DueeColorThemeCatalog.defaultCustomHexes[0])
    #expect(normalized[1] == DueeColorThemeCatalog.defaultCustomHexes[1])
    #expect(normalized[2] == DueeColorThemeCatalog.defaultCustomHexes[2])
}

@Test func editableHexSerializationSanitizesAndUppercases() async throws {
    let serialized = DueeColorThemeCatalog.serializeEditableHexes(["#abc123", "g7h8i9", "12-34-56", "ff00aa"])
    #expect(serialized == "ABC123,789,123456")
}

@Test func themeCatalogIncludesCurrentPresetsAndCustom() async throws {
    let themes = DueeColorThemeCatalog.allThemes(customThemeRaw: DueeColorThemeCatalog.defaultCustomThemeRawValue)
    #expect(themes.count == 7)
    #expect(themes.first?.id == DueeColorThemeCatalog.defaultThemeID)
    #expect(themes.last?.id == DueeColorThemeCatalog.customThemeID)
}

@Test func unknownThemeFallsBackToCurrent() async throws {
    let fallback = DueeColorThemeCatalog.theme(for: "does-not-exist", customThemeRaw: "")
    #expect(fallback.id == DueeColorThemeCatalog.defaultThemeID)
    #expect(fallback.isCurrent)
}

@Test func legacyThemeIDsMigrateToNamedThemes() async throws {
    #expect(DueeColorThemeCatalog.normalizedThemeID("current") == "minimal")
    #expect(DueeColorThemeCatalog.normalizedThemeID("palette-1") == "pulse")
    #expect(DueeColorThemeCatalog.normalizedThemeID("palette-2") == "grove")
    #expect(DueeColorThemeCatalog.normalizedThemeID("palette-3") == "desk")
    #expect(DueeColorThemeCatalog.normalizedThemeID("palette-4") == "harbor")
    #expect(DueeColorThemeCatalog.normalizedThemeID("palette-5") == "studio")
}

@Test func legacyCustomFourSlotValuesMigrateToThreeSlotInputs() async throws {
    let migrated = DueeColorThemeCatalog.editableCustomHexes(from: "F7F6E5,76D2DB,DA4848,36064D")
    #expect(migrated.count == DueeColorThemeCatalog.customInputColorCount)
    #expect(migrated[0] == "F7F6E5")
    #expect(migrated[1] == "DA4848")
    #expect(migrated[2] == "36064D")
}
