// ---------------------------------------------------------------------------
// Ge O'Miner  --  Site Smart Contract
// ---------------------------------------------------------------------------
package main

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// MiningSite represents an illegal mining site detected by the AI pipeline.
type MiningSite struct {
	ID           string  `json:"id"`
	SiteCode     string  `json:"siteCode"`
	GeometryWKT  string  `json:"geometryWKT"`
	AreaHa       float64 `json:"areaHa"`
	ConfidenceAI float64 `json:"confidenceAI"`
	DetectedAt   string  `json:"detectedAt"`
	Status       string  `json:"status"`
	Region       string  `json:"region"`
	Department   string  `json:"department"`
	IPFSCid      string  `json:"ipfsCid"`
	CreatedBy    string  `json:"createdBy"`
	UpdatedAt    string  `json:"updatedAt"`
}

// SiteContract provides functions for managing mining sites on the ledger.
type SiteContract struct {
	contractapi.Contract
}

// Allowed status transitions.
// DETECTED -> UNDER_REVIEW -> CONFIRMED -> ACTIVE | ESCALATED
// ACTIVE -> DISMANTLED
// DISMANTLED -> RECURRED
var allowedTransitions = map[string][]string{
	"DETECTED":     {"UNDER_REVIEW"},
	"UNDER_REVIEW": {"CONFIRMED"},
	"CONFIRMED":    {"ACTIVE", "ESCALATED"},
	"ACTIVE":       {"DISMANTLED"},
	"DISMANTLED":   {"RECURRED"},
}

// ---------------------------------------------------------------------------
// CreateSite stores a newly detected mining site on the ledger.
// ---------------------------------------------------------------------------
func (sc *SiteContract) CreateSite(
	ctx contractapi.TransactionContextInterface,
	id string,
	siteCode string,
	geometryWKT string,
	areaHa float64,
	confidenceAI float64,
	region string,
	department string,
	createdBy string,
) error {
	// Check whether the site already exists.
	existing, err := ctx.GetStub().GetState(id)
	if err != nil {
		return fmt.Errorf("failed to read from world state: %w", err)
	}
	if existing != nil {
		return fmt.Errorf("site %s already exists", id)
	}

	now := time.Now().UTC().Format(time.RFC3339)

	site := MiningSite{
		ID:           id,
		SiteCode:     siteCode,
		GeometryWKT:  geometryWKT,
		AreaHa:       areaHa,
		ConfidenceAI: confidenceAI,
		DetectedAt:   now,
		Status:       "DETECTED",
		Region:       region,
		Department:   department,
		IPFSCid:      "",
		CreatedBy:    createdBy,
		UpdatedAt:    now,
	}

	siteJSON, err := json.Marshal(site)
	if err != nil {
		return fmt.Errorf("failed to marshal site: %w", err)
	}

	// Store the site under its primary key.
	if err := ctx.GetStub().PutState(id, siteJSON); err != nil {
		return fmt.Errorf("failed to put state: %w", err)
	}

	// Create a composite key for status-based queries.
	compositeKey, err := ctx.GetStub().CreateCompositeKey("status~id", []string{site.Status, id})
	if err != nil {
		return fmt.Errorf("failed to create composite key: %w", err)
	}
	if err := ctx.GetStub().PutState(compositeKey, []byte{0x00}); err != nil {
		return fmt.Errorf("failed to put composite key: %w", err)
	}

	return nil
}

// ---------------------------------------------------------------------------
// UpdateStatus transitions a site to a new status following the allowed cycle.
// ---------------------------------------------------------------------------
func (sc *SiteContract) UpdateStatus(
	ctx contractapi.TransactionContextInterface,
	id string,
	newStatus string,
	updatedBy string,
) error {
	siteJSON, err := ctx.GetStub().GetState(id)
	if err != nil {
		return fmt.Errorf("failed to read site %s: %w", id, err)
	}
	if siteJSON == nil {
		return fmt.Errorf("site %s does not exist", id)
	}

	var site MiningSite
	if err := json.Unmarshal(siteJSON, &site); err != nil {
		return fmt.Errorf("failed to unmarshal site: %w", err)
	}

	// Validate the transition.
	allowed, ok := allowedTransitions[site.Status]
	if !ok {
		return fmt.Errorf("no transitions allowed from status %s", site.Status)
	}

	valid := false
	for _, s := range allowed {
		if s == newStatus {
			valid = true
			break
		}
	}
	if !valid {
		return fmt.Errorf("transition from %s to %s is not allowed", site.Status, newStatus)
	}

	// Remove old composite key.
	oldCompositeKey, err := ctx.GetStub().CreateCompositeKey("status~id", []string{site.Status, id})
	if err != nil {
		return fmt.Errorf("failed to create old composite key: %w", err)
	}
	if err := ctx.GetStub().DelState(oldCompositeKey); err != nil {
		return fmt.Errorf("failed to delete old composite key: %w", err)
	}

	// Update fields.
	site.Status = newStatus
	site.UpdatedAt = time.Now().UTC().Format(time.RFC3339)

	updatedJSON, err := json.Marshal(site)
	if err != nil {
		return fmt.Errorf("failed to marshal updated site: %w", err)
	}

	if err := ctx.GetStub().PutState(id, updatedJSON); err != nil {
		return fmt.Errorf("failed to put updated state: %w", err)
	}

	// Create new composite key.
	newCompositeKey, err := ctx.GetStub().CreateCompositeKey("status~id", []string{newStatus, id})
	if err != nil {
		return fmt.Errorf("failed to create new composite key: %w", err)
	}
	if err := ctx.GetStub().PutState(newCompositeKey, []byte{0x00}); err != nil {
		return fmt.Errorf("failed to put new composite key: %w", err)
	}

	return nil
}

// ---------------------------------------------------------------------------
// GetSite returns a single site by its ID.
// ---------------------------------------------------------------------------
func (sc *SiteContract) GetSite(
	ctx contractapi.TransactionContextInterface,
	id string,
) (*MiningSite, error) {
	siteJSON, err := ctx.GetStub().GetState(id)
	if err != nil {
		return nil, fmt.Errorf("failed to read site %s: %w", id, err)
	}
	if siteJSON == nil {
		return nil, fmt.Errorf("site %s does not exist", id)
	}

	var site MiningSite
	if err := json.Unmarshal(siteJSON, &site); err != nil {
		return nil, fmt.Errorf("failed to unmarshal site: %w", err)
	}

	return &site, nil
}

// ---------------------------------------------------------------------------
// GetSiteHistory returns the full modification history of a site.
// ---------------------------------------------------------------------------
func (sc *SiteContract) GetSiteHistory(
	ctx contractapi.TransactionContextInterface,
	id string,
) ([]map[string]interface{}, error) {
	historyIterator, err := ctx.GetStub().GetHistoryForKey(id)
	if err != nil {
		return nil, fmt.Errorf("failed to get history for site %s: %w", id, err)
	}
	defer historyIterator.Close()

	var history []map[string]interface{}

	for historyIterator.HasNext() {
		modification, err := historyIterator.Next()
		if err != nil {
			return nil, fmt.Errorf("failed to iterate history: %w", err)
		}

		entry := map[string]interface{}{
			"txId":      modification.TxId,
			"timestamp": time.Unix(modification.Timestamp.Seconds, int64(modification.Timestamp.Nanos)).UTC().Format(time.RFC3339),
			"isDelete":  modification.IsDelete,
		}

		if !modification.IsDelete {
			var site MiningSite
			if err := json.Unmarshal(modification.Value, &site); err == nil {
				entry["value"] = site
			} else {
				entry["value"] = string(modification.Value)
			}
		}

		history = append(history, entry)
	}

	return history, nil
}

// ---------------------------------------------------------------------------
// GetSitesByStatus returns all sites with the given status using a composite
// key range query.
// ---------------------------------------------------------------------------
func (sc *SiteContract) GetSitesByStatus(
	ctx contractapi.TransactionContextInterface,
	status string,
) ([]*MiningSite, error) {
	iterator, err := ctx.GetStub().GetStateByPartialCompositeKey("status~id", []string{status})
	if err != nil {
		return nil, fmt.Errorf("failed to get sites by status %s: %w", status, err)
	}
	defer iterator.Close()

	var sites []*MiningSite

	for iterator.HasNext() {
		responseRange, err := iterator.Next()
		if err != nil {
			return nil, fmt.Errorf("failed to iterate composite keys: %w", err)
		}

		_, compositeKeyParts, err := ctx.GetStub().SplitCompositeKey(responseRange.Key)
		if err != nil {
			return nil, fmt.Errorf("failed to split composite key: %w", err)
		}

		if len(compositeKeyParts) < 2 {
			continue
		}

		siteID := compositeKeyParts[1]
		siteJSON, err := ctx.GetStub().GetState(siteID)
		if err != nil {
			return nil, fmt.Errorf("failed to read site %s: %w", siteID, err)
		}
		if siteJSON == nil {
			continue
		}

		var site MiningSite
		if err := json.Unmarshal(siteJSON, &site); err != nil {
			return nil, fmt.Errorf("failed to unmarshal site %s: %w", siteID, err)
		}

		sites = append(sites, &site)
	}

	return sites, nil
}
