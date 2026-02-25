// ---------------------------------------------------------------------------
// Ge O'Miner  --  Site Smart Contract Unit Tests
// ---------------------------------------------------------------------------
package main

import (
	"encoding/json"
	"fmt"
	"testing"

	"github.com/hyperledger/fabric-chaincode-go/shim"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
)

// ---------------------------------------------------------------------------
// Mock ChaincodeStub
// ---------------------------------------------------------------------------
type MockChaincodeStub struct {
	mock.Mock
	shim.ChaincodeStubInterface
	state         map[string][]byte
	compositeKeys map[string][]byte
}

func NewMockChaincodeStub() *MockChaincodeStub {
	return &MockChaincodeStub{
		state:         make(map[string][]byte),
		compositeKeys: make(map[string][]byte),
	}
}

func (m *MockChaincodeStub) GetState(key string) ([]byte, error) {
	args := m.Called(key)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]byte), args.Error(1)
}

func (m *MockChaincodeStub) PutState(key string, value []byte) error {
	args := m.Called(key, value)
	m.state[key] = value
	return args.Error(0)
}

func (m *MockChaincodeStub) DelState(key string) error {
	args := m.Called(key)
	delete(m.state, key)
	return args.Error(0)
}

func (m *MockChaincodeStub) CreateCompositeKey(objectType string, attributes []string) (string, error) {
	args := m.Called(objectType, attributes)
	return args.String(0), args.Error(1)
}

func (m *MockChaincodeStub) GetStateByPartialCompositeKey(objectType string, keys []string) (shim.StateQueryIteratorInterface, error) {
	args := m.Called(objectType, keys)
	return args.Get(0).(shim.StateQueryIteratorInterface), args.Error(1)
}

func (m *MockChaincodeStub) SplitCompositeKey(compositeKey string) (string, []string, error) {
	args := m.Called(compositeKey)
	return args.String(0), args.Get(1).([]string), args.Error(2)
}

// ---------------------------------------------------------------------------
// Mock TransactionContext
// ---------------------------------------------------------------------------
type MockTransactionContext struct {
	contractapi.TransactionContext
	stub *MockChaincodeStub
}

func (m *MockTransactionContext) GetStub() shim.ChaincodeStubInterface {
	return m.stub
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

func TestCreateSite(t *testing.T) {
	stub := NewMockChaincodeStub()
	ctx := &MockTransactionContext{stub: stub}
	sc := new(SiteContract)

	id := "SITE-001"
	compositeKey := "status~id\x00DETECTED\x00SITE-001\x00"

	// Site does not exist yet.
	stub.On("GetState", id).Return(nil, nil).Once()
	stub.On("PutState", id, mock.AnythingOfType("[]uint8")).Return(nil).Once()
	stub.On("CreateCompositeKey", "status~id", []string{"DETECTED", id}).Return(compositeKey, nil).Once()
	stub.On("PutState", compositeKey, []byte{0x00}).Return(nil).Once()

	err := sc.CreateSite(ctx, id, "MCK-2024-0001", "POLYGON((...))", 12.5, 0.92, "Kolwezi", "Lualaba", "ai-pipeline")
	assert.NoError(t, err)

	// Verify the site was stored.
	storedJSON := stub.state[id]
	assert.NotNil(t, storedJSON)

	var site MiningSite
	err = json.Unmarshal(storedJSON, &site)
	assert.NoError(t, err)
	assert.Equal(t, id, site.ID)
	assert.Equal(t, "MCK-2024-0001", site.SiteCode)
	assert.Equal(t, "DETECTED", site.Status)
	assert.Equal(t, 12.5, site.AreaHa)
	assert.Equal(t, 0.92, site.ConfidenceAI)
	assert.Equal(t, "Kolwezi", site.Region)
	assert.Equal(t, "Lualaba", site.Department)
	assert.Equal(t, "ai-pipeline", site.CreatedBy)

	stub.AssertExpectations(t)
}

func TestCreateSite_AlreadyExists(t *testing.T) {
	stub := NewMockChaincodeStub()
	ctx := &MockTransactionContext{stub: stub}
	sc := new(SiteContract)

	id := "SITE-001"
	existingSite := MiningSite{ID: id, Status: "DETECTED"}
	existingJSON, _ := json.Marshal(existingSite)

	stub.On("GetState", id).Return(existingJSON, nil).Once()

	err := sc.CreateSite(ctx, id, "MCK-2024-0001", "POLYGON((...))", 12.5, 0.92, "Kolwezi", "Lualaba", "ai-pipeline")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "already exists")

	stub.AssertExpectations(t)
}

func TestUpdateStatus_ValidTransition(t *testing.T) {
	stub := NewMockChaincodeStub()
	ctx := &MockTransactionContext{stub: stub}
	sc := new(SiteContract)

	id := "SITE-001"
	oldCompositeKey := "status~id\x00DETECTED\x00SITE-001\x00"
	newCompositeKey := "status~id\x00UNDER_REVIEW\x00SITE-001\x00"

	site := MiningSite{
		ID:           id,
		SiteCode:     "MCK-2024-0001",
		GeometryWKT:  "POLYGON((...))",
		AreaHa:       12.5,
		ConfidenceAI: 0.92,
		DetectedAt:   "2024-01-15T10:00:00Z",
		Status:       "DETECTED",
		Region:       "Kolwezi",
		Department:   "Lualaba",
		CreatedBy:    "ai-pipeline",
		UpdatedAt:    "2024-01-15T10:00:00Z",
	}
	siteJSON, _ := json.Marshal(site)

	stub.On("GetState", id).Return(siteJSON, nil).Once()
	stub.On("CreateCompositeKey", "status~id", []string{"DETECTED", id}).Return(oldCompositeKey, nil).Once()
	stub.On("DelState", oldCompositeKey).Return(nil).Once()
	stub.On("PutState", id, mock.AnythingOfType("[]uint8")).Return(nil).Once()
	stub.On("CreateCompositeKey", "status~id", []string{"UNDER_REVIEW", id}).Return(newCompositeKey, nil).Once()
	stub.On("PutState", newCompositeKey, []byte{0x00}).Return(nil).Once()

	err := sc.UpdateStatus(ctx, id, "UNDER_REVIEW", "inspector-01")
	assert.NoError(t, err)

	// Verify the status was updated.
	updatedJSON := stub.state[id]
	assert.NotNil(t, updatedJSON)

	var updatedSite MiningSite
	err = json.Unmarshal(updatedJSON, &updatedSite)
	assert.NoError(t, err)
	assert.Equal(t, "UNDER_REVIEW", updatedSite.Status)

	stub.AssertExpectations(t)
}

func TestUpdateStatus_InvalidTransition(t *testing.T) {
	stub := NewMockChaincodeStub()
	ctx := &MockTransactionContext{stub: stub}
	sc := new(SiteContract)

	id := "SITE-001"

	site := MiningSite{
		ID:     id,
		Status: "DETECTED",
	}
	siteJSON, _ := json.Marshal(site)

	// Try to go directly from DETECTED to ACTIVE (skipping UNDER_REVIEW and CONFIRMED).
	stub.On("GetState", id).Return(siteJSON, nil).Once()

	err := sc.UpdateStatus(ctx, id, "ACTIVE", "inspector-01")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "not allowed")

	stub.AssertExpectations(t)
}

func TestUpdateStatus_InvalidTransition_AllPaths(t *testing.T) {
	tests := []struct {
		name        string
		fromStatus  string
		toStatus    string
		expectError string
	}{
		{"DETECTED to ACTIVE", "DETECTED", "ACTIVE", "not allowed"},
		{"DETECTED to CONFIRMED", "DETECTED", "CONFIRMED", "not allowed"},
		{"UNDER_REVIEW to ACTIVE", "UNDER_REVIEW", "ACTIVE", "not allowed"},
		{"CONFIRMED to DISMANTLED", "CONFIRMED", "DISMANTLED", "not allowed"},
		{"ACTIVE to CONFIRMED", "ACTIVE", "CONFIRMED", "not allowed"},
		{"DISMANTLED to ACTIVE", "DISMANTLED", "ACTIVE", "not allowed"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			stub := NewMockChaincodeStub()
			ctx := &MockTransactionContext{stub: stub}
			sc := new(SiteContract)

			id := "SITE-001"
			site := MiningSite{ID: id, Status: tt.fromStatus}
			siteJSON, _ := json.Marshal(site)

			stub.On("GetState", id).Return(siteJSON, nil).Once()

			err := sc.UpdateStatus(ctx, id, tt.toStatus, "inspector-01")
			assert.Error(t, err)
			assert.Contains(t, err.Error(), tt.expectError)

			stub.AssertExpectations(t)
		})
	}
}

func TestUpdateStatus_SiteNotFound(t *testing.T) {
	stub := NewMockChaincodeStub()
	ctx := &MockTransactionContext{stub: stub}
	sc := new(SiteContract)

	stub.On("GetState", "NONEXISTENT").Return(nil, nil).Once()

	err := sc.UpdateStatus(ctx, "NONEXISTENT", "UNDER_REVIEW", "inspector-01")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "does not exist")

	stub.AssertExpectations(t)
}

func TestGetSite(t *testing.T) {
	stub := NewMockChaincodeStub()
	ctx := &MockTransactionContext{stub: stub}
	sc := new(SiteContract)

	id := "SITE-001"
	expectedSite := MiningSite{
		ID:           id,
		SiteCode:     "MCK-2024-0001",
		GeometryWKT:  "POLYGON((...))",
		AreaHa:       12.5,
		ConfidenceAI: 0.92,
		DetectedAt:   "2024-01-15T10:00:00Z",
		Status:       "DETECTED",
		Region:       "Kolwezi",
		Department:   "Lualaba",
		CreatedBy:    "ai-pipeline",
		UpdatedAt:    "2024-01-15T10:00:00Z",
	}
	siteJSON, _ := json.Marshal(expectedSite)

	stub.On("GetState", id).Return(siteJSON, nil).Once()

	site, err := sc.GetSite(ctx, id)
	assert.NoError(t, err)
	assert.NotNil(t, site)
	assert.Equal(t, id, site.ID)
	assert.Equal(t, "MCK-2024-0001", site.SiteCode)
	assert.Equal(t, "DETECTED", site.Status)
	assert.Equal(t, 12.5, site.AreaHa)
	assert.Equal(t, 0.92, site.ConfidenceAI)
	assert.Equal(t, "Kolwezi", site.Region)
	assert.Equal(t, "Lualaba", site.Department)
	assert.Equal(t, "ai-pipeline", site.CreatedBy)

	stub.AssertExpectations(t)
}

func TestGetSite_NotFound(t *testing.T) {
	stub := NewMockChaincodeStub()
	ctx := &MockTransactionContext{stub: stub}
	sc := new(SiteContract)

	stub.On("GetState", "NONEXISTENT").Return(nil, nil).Once()

	site, err := sc.GetSite(ctx, "NONEXISTENT")
	assert.Error(t, err)
	assert.Nil(t, site)
	assert.Contains(t, err.Error(), "does not exist")

	stub.AssertExpectations(t)
}

func TestGetSite_ReadError(t *testing.T) {
	stub := NewMockChaincodeStub()
	ctx := &MockTransactionContext{stub: stub}
	sc := new(SiteContract)

	stub.On("GetState", "SITE-001").Return(nil, fmt.Errorf("ledger error")).Once()

	site, err := sc.GetSite(ctx, "SITE-001")
	assert.Error(t, err)
	assert.Nil(t, site)
	assert.Contains(t, err.Error(), "failed to read")

	stub.AssertExpectations(t)
}
