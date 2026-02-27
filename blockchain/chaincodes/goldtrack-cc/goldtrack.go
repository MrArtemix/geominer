// ---------------------------------------------------------------------------
// Ge O'Miner  --  GoldTrack Smart Contract
//
// Tracabilite de l'or : enregistrement des transactions, requetes par entite,
// historique complet et calcul de score de divergence par zone H3.
// ---------------------------------------------------------------------------
package main

import (
	"encoding/json"
	"fmt"
	"math"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// GoldTransaction represente une transaction d'or sur la chaine.
type GoldTransaction struct {
	ID            string            `json:"id"`
	SiteID        string            `json:"siteId"`
	FromEntity    string            `json:"fromEntity"`
	ToEntity      string            `json:"toEntity"`
	QuantityGrams float64           `json:"quantityGrams"`
	IsLegal       bool              `json:"isLegal"`
	H3Index       string            `json:"h3Index"`
	Metadata      map[string]string `json:"metadata,omitempty"`
	CreatedAt     string            `json:"createdAt"`
	CreatedBy     string            `json:"createdBy"`
}

// DivergenceResult represente le score de divergence pour une zone H3.
type DivergenceResult struct {
	H3Index         string  `json:"h3Index"`
	TotalLegal      float64 `json:"totalLegal"`
	TotalIllegal    float64 `json:"totalIllegal"`
	DivergenceScore float64 `json:"divergenceScore"`
	TransactionCount int    `json:"transactionCount"`
}

// GoldTrackContract fournit les fonctions de tracabilite de l'or.
type GoldTrackContract struct {
	contractapi.Contract
}

// ---------------------------------------------------------------------------
// RecordTransaction enregistre une nouvelle transaction d'or sur le ledger.
// ---------------------------------------------------------------------------
func (gc *GoldTrackContract) RecordTransaction(
	ctx contractapi.TransactionContextInterface,
	id string,
	siteID string,
	fromEntity string,
	toEntity string,
	quantityGrams float64,
	isLegal bool,
	h3Index string,
	createdBy string,
) error {
	// Verifier que la transaction n'existe pas deja
	existing, err := ctx.GetStub().GetState(id)
	if err != nil {
		return fmt.Errorf("echec lecture state: %w", err)
	}
	if existing != nil {
		return fmt.Errorf("transaction %s existe deja", id)
	}

	if quantityGrams <= 0 {
		return fmt.Errorf("la quantite doit etre positive: %f", quantityGrams)
	}

	now := time.Now().UTC().Format(time.RFC3339)

	tx := GoldTransaction{
		ID:            id,
		SiteID:        siteID,
		FromEntity:    fromEntity,
		ToEntity:      toEntity,
		QuantityGrams: quantityGrams,
		IsLegal:       isLegal,
		H3Index:       h3Index,
		CreatedAt:     now,
		CreatedBy:     createdBy,
	}

	txJSON, err := json.Marshal(tx)
	if err != nil {
		return fmt.Errorf("echec serialisation transaction: %w", err)
	}

	// Stocker la transaction
	if err := ctx.GetStub().PutState(id, txJSON); err != nil {
		return fmt.Errorf("echec ecriture state: %w", err)
	}

	// Index composite par entite (from)
	fromKey, err := ctx.GetStub().CreateCompositeKey("from~id", []string{fromEntity, id})
	if err != nil {
		return fmt.Errorf("echec creation cle composite from: %w", err)
	}
	if err := ctx.GetStub().PutState(fromKey, []byte{0x00}); err != nil {
		return fmt.Errorf("echec ecriture cle composite from: %w", err)
	}

	// Index composite par entite (to)
	toKey, err := ctx.GetStub().CreateCompositeKey("to~id", []string{toEntity, id})
	if err != nil {
		return fmt.Errorf("echec creation cle composite to: %w", err)
	}
	if err := ctx.GetStub().PutState(toKey, []byte{0x00}); err != nil {
		return fmt.Errorf("echec ecriture cle composite to: %w", err)
	}

	// Index composite par H3
	h3Key, err := ctx.GetStub().CreateCompositeKey("h3~id", []string{h3Index, id})
	if err != nil {
		return fmt.Errorf("echec creation cle composite h3: %w", err)
	}
	if err := ctx.GetStub().PutState(h3Key, []byte{0x00}); err != nil {
		return fmt.Errorf("echec ecriture cle composite h3: %w", err)
	}

	// Index composite par site
	siteKey, err := ctx.GetStub().CreateCompositeKey("site~id", []string{siteID, id})
	if err != nil {
		return fmt.Errorf("echec creation cle composite site: %w", err)
	}
	if err := ctx.GetStub().PutState(siteKey, []byte{0x00}); err != nil {
		return fmt.Errorf("echec ecriture cle composite site: %w", err)
	}

	return nil
}

// ---------------------------------------------------------------------------
// GetTransaction retourne une transaction par son ID.
// ---------------------------------------------------------------------------
func (gc *GoldTrackContract) GetTransaction(
	ctx contractapi.TransactionContextInterface,
	id string,
) (*GoldTransaction, error) {
	txJSON, err := ctx.GetStub().GetState(id)
	if err != nil {
		return nil, fmt.Errorf("echec lecture transaction %s: %w", id, err)
	}
	if txJSON == nil {
		return nil, fmt.Errorf("transaction %s non trouvee", id)
	}

	var tx GoldTransaction
	if err := json.Unmarshal(txJSON, &tx); err != nil {
		return nil, fmt.Errorf("echec deserialisation transaction: %w", err)
	}

	return &tx, nil
}

// ---------------------------------------------------------------------------
// QueryByEntity retourne toutes les transactions impliquant une entite
// (en tant qu'emetteur ou destinataire).
// ---------------------------------------------------------------------------
func (gc *GoldTrackContract) QueryByEntity(
	ctx contractapi.TransactionContextInterface,
	entity string,
) ([]*GoldTransaction, error) {
	txMap := make(map[string]bool)
	var transactions []*GoldTransaction

	// Chercher les transactions ou l'entite est emetteur
	fromIterator, err := ctx.GetStub().GetStateByPartialCompositeKey("from~id", []string{entity})
	if err != nil {
		return nil, fmt.Errorf("echec requete from: %w", err)
	}
	defer fromIterator.Close()

	for fromIterator.HasNext() {
		responseRange, err := fromIterator.Next()
		if err != nil {
			return nil, fmt.Errorf("echec iteration from: %w", err)
		}

		_, parts, err := ctx.GetStub().SplitCompositeKey(responseRange.Key)
		if err != nil || len(parts) < 2 {
			continue
		}

		txID := parts[1]
		if txMap[txID] {
			continue
		}
		txMap[txID] = true

		tx, err := gc.GetTransaction(ctx, txID)
		if err == nil {
			transactions = append(transactions, tx)
		}
	}

	// Chercher les transactions ou l'entite est destinataire
	toIterator, err := ctx.GetStub().GetStateByPartialCompositeKey("to~id", []string{entity})
	if err != nil {
		return nil, fmt.Errorf("echec requete to: %w", err)
	}
	defer toIterator.Close()

	for toIterator.HasNext() {
		responseRange, err := toIterator.Next()
		if err != nil {
			return nil, fmt.Errorf("echec iteration to: %w", err)
		}

		_, parts, err := ctx.GetStub().SplitCompositeKey(responseRange.Key)
		if err != nil || len(parts) < 2 {
			continue
		}

		txID := parts[1]
		if txMap[txID] {
			continue
		}
		txMap[txID] = true

		tx, err := gc.GetTransaction(ctx, txID)
		if err == nil {
			transactions = append(transactions, tx)
		}
	}

	return transactions, nil
}

// ---------------------------------------------------------------------------
// GetTransactionHistory retourne l'historique des modifications d'une transaction.
// ---------------------------------------------------------------------------
func (gc *GoldTrackContract) GetTransactionHistory(
	ctx contractapi.TransactionContextInterface,
	id string,
) ([]map[string]interface{}, error) {
	historyIterator, err := ctx.GetStub().GetHistoryForKey(id)
	if err != nil {
		return nil, fmt.Errorf("echec recuperation historique %s: %w", id, err)
	}
	defer historyIterator.Close()

	var history []map[string]interface{}

	for historyIterator.HasNext() {
		modification, err := historyIterator.Next()
		if err != nil {
			return nil, fmt.Errorf("echec iteration historique: %w", err)
		}

		entry := map[string]interface{}{
			"txId":      modification.TxId,
			"timestamp": time.Unix(modification.Timestamp.Seconds, int64(modification.Timestamp.Nanos)).UTC().Format(time.RFC3339),
			"isDelete":  modification.IsDelete,
		}

		if !modification.IsDelete {
			var tx GoldTransaction
			if err := json.Unmarshal(modification.Value, &tx); err == nil {
				entry["value"] = tx
			} else {
				entry["value"] = string(modification.Value)
			}
		}

		history = append(history, entry)
	}

	return history, nil
}

// ---------------------------------------------------------------------------
// ComputeDivergenceScore calcule le score de divergence pour une zone H3.
//
// Score = |legal - illegal| / total
// Un score proche de 1.0 = zone homogene (tout legal ou tout illegal)
// Un score proche de 0.0 = zone mixte (activite suspecte)
// ---------------------------------------------------------------------------
func (gc *GoldTrackContract) ComputeDivergenceScore(
	ctx contractapi.TransactionContextInterface,
	h3Index string,
) (*DivergenceResult, error) {
	iterator, err := ctx.GetStub().GetStateByPartialCompositeKey("h3~id", []string{h3Index})
	if err != nil {
		return nil, fmt.Errorf("echec requete H3 %s: %w", h3Index, err)
	}
	defer iterator.Close()

	var totalLegal float64
	var totalIllegal float64
	var txCount int

	for iterator.HasNext() {
		responseRange, err := iterator.Next()
		if err != nil {
			return nil, fmt.Errorf("echec iteration H3: %w", err)
		}

		_, parts, err := ctx.GetStub().SplitCompositeKey(responseRange.Key)
		if err != nil || len(parts) < 2 {
			continue
		}

		txID := parts[1]
		tx, err := gc.GetTransaction(ctx, txID)
		if err != nil {
			continue
		}

		txCount++
		if tx.IsLegal {
			totalLegal += tx.QuantityGrams
		} else {
			totalIllegal += tx.QuantityGrams
		}
	}

	total := totalLegal + totalIllegal
	var divergenceScore float64
	if total > 0 {
		divergenceScore = math.Abs(totalLegal-totalIllegal) / total
	}

	return &DivergenceResult{
		H3Index:          h3Index,
		TotalLegal:       totalLegal,
		TotalIllegal:     totalIllegal,
		DivergenceScore:  divergenceScore,
		TransactionCount: txCount,
	}, nil
}

// ---------------------------------------------------------------------------
// QueryBySite retourne toutes les transactions associees a un site minier.
// ---------------------------------------------------------------------------
func (gc *GoldTrackContract) QueryBySite(
	ctx contractapi.TransactionContextInterface,
	siteID string,
) ([]*GoldTransaction, error) {
	iterator, err := ctx.GetStub().GetStateByPartialCompositeKey("site~id", []string{siteID})
	if err != nil {
		return nil, fmt.Errorf("echec requete site %s: %w", siteID, err)
	}
	defer iterator.Close()

	var transactions []*GoldTransaction

	for iterator.HasNext() {
		responseRange, err := iterator.Next()
		if err != nil {
			return nil, fmt.Errorf("echec iteration site: %w", err)
		}

		_, parts, err := ctx.GetStub().SplitCompositeKey(responseRange.Key)
		if err != nil || len(parts) < 2 {
			continue
		}

		txID := parts[1]
		tx, err := gc.GetTransaction(ctx, txID)
		if err == nil {
			transactions = append(transactions, tx)
		}
	}

	return transactions, nil
}
