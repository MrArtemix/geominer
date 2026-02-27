-- =============================================================
-- Ge O'Miner - Schema Image Analysis (Prompt 11)
-- Tables additionnelles pour la liaison CV / Base de Donnees
-- =============================================================

-- Table de similarite entre images
CREATE TABLE IF NOT EXISTS image_similarities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    image_id UUID NOT NULL REFERENCES mining_sites(id) ON DELETE CASCADE,
    similar_image_id UUID NOT NULL REFERENCES mining_sites(id) ON DELETE CASCADE,
    similarity_score NUMERIC(6,4) CHECK (similarity_score >= 0 AND similarity_score <= 1),
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_image_similarity UNIQUE (image_id, similar_image_id),
    CONSTRAINT chk_different_images CHECK (image_id != similar_image_id)
);

CREATE INDEX idx_image_similarities_image ON image_similarities(image_id);
CREATE INDEX idx_image_similarities_similar ON image_similarities(similar_image_id);
CREATE INDEX idx_image_similarities_score ON image_similarities(similarity_score DESC);

-- Colonnes additionnelles sur satellite_scenes (si la table existe)
-- Sinon, on les ajoute sur mining_sites qui sert de reference images
DO $$ BEGIN
    -- last_analysis : date de la derniere analyse
    ALTER TABLE mining_sites ADD COLUMN IF NOT EXISTS
        last_analysis TIMESTAMPTZ;

    -- analysis_results : resultats d'analyse JSON
    ALTER TABLE mining_sites ADD COLUMN IF NOT EXISTS
        analysis_results JSONB DEFAULT '{}'::jsonb;

    -- feature_vector : vecteur de features pour recherche de similarite
    -- Stocke en bytea (serialise numpy)
    ALTER TABLE mining_sites ADD COLUMN IF NOT EXISTS
        feature_vector BYTEA;

    -- quality_score : score de qualite de l'image (0-1)
    ALTER TABLE mining_sites ADD COLUMN IF NOT EXISTS
        quality_score NUMERIC(5,4) CHECK (quality_score >= 0 AND quality_score <= 1);

EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Erreur ajout colonnes mining_sites: %', SQLERRM;
END $$;

-- Index sur les nouvelles colonnes
CREATE INDEX IF NOT EXISTS idx_mining_sites_last_analysis
    ON mining_sites(last_analysis DESC)
    WHERE last_analysis IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mining_sites_quality_score
    ON mining_sites(quality_score DESC)
    WHERE quality_score IS NOT NULL;
