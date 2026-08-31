const sheetMapping = {
    rowsPerRecord: 3,
    firstDataRowNumber: 1,
    skipCompletelyEmptyRows: false,
    splitFields: [
        {
            sourceColumn: 'ppt_number_en_number',
            separator: '-',
            targetColumns: ['ppt_number', 'en_number']
        },
        {
            sourceColumn: 'category_salary',
            separator: '-',
            targetColumns: ['category', 'salary']
        }
    ],

    fields: [
        { column: 'date', row: 0, col: 0, type: 'date' },
        { column: 'ppt_name', row: 0, col: 1 },
        { column: 'ppt_number_en_number', row: 0, col: 2 },
        { column: 'dob', row: 0, col: 3, type: 'date' },
        { column: 'sponsor_phone_number', row: 0, col: 5 },
        { column: 'jb_id', row: 0, col: 6 },
        { column: 'visa_number', row: 0, col: 7 },
        { column: 'father_name', row: 0, col: 8 },
        { column: 'legal_status', row: 0, col: 9 },

        { column: 'sr_no', row: 1, col: 0 },
        { column: 'ppt_address', row: 1, col: 1 },
        { column: 'ppt_issue_date', row: 1, col: 2, type: 'date' },
        { column: 'ppt_issue_place', row: 1, col: 3 },
        { column: 'country', row: 1, col: 4 },
        { column: 'category_salary', row: 1, col: 5 },
        { column: 'sponsor_name', row: 1, col: 6 },
        { column: 'visa_issue_date', row: 1, col: 7, type: 'date' },
        { column: 'id_name', row: 1, col: 9 },

        { column: 'broker_name', row: 2, col: 0 },
        { column: 'job_role', row: 2, col: 1 },
        { column: 'ppt_expiry_date', row: 2, col: 2, type: 'date' },
        { column: 'fe_number', row: 2, col: 3 },
        { column: 'dm_number', row: 2, col: 4 },
        { column: 'sponsor_address', row: 2, col: 5 },
        { column: 'cr_number', row: 2, col: 6 },
        { column: 'visa_expiry_date', row: 2, col: 7, type: 'date' },
        { column: 'mother_name', row: 2, col: 8 },
        { column: 'id_number', row: 2, col: 9 }
    ]
};

module.exports = { sheetMapping };