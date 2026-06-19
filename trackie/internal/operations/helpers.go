package operations

import "database/sql"

func stringOrNil(v sql.NullString) *string {
	if !v.Valid {
		return nil
	}
	value := v.String
	return &value
}

func floatOrNil(v sql.NullFloat64) *float64 {
	if !v.Valid {
		return nil
	}
	value := v.Float64
	return &value
}
