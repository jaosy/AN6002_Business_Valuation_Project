import React, { useState } from 'react';

const industries = {
  "Information Technology": ["IBM", "Intel", "Microsoft", "Nvidia", "ServiceNow"],
  "Health Care": ["AbbVie", "Cigna", "IQVIA", "Eli Lilly", "Pfizer"],
  "Finance": ["JP Morgan Chase", "PayPal", "Visa Inc", "Goldman Sachs", "American Express"],
};

const timePeriods = [
  "1 day", "5 days", "1 month", "3 months", "6 months", "1 year", "2 years", "5 years", "10 years", "Year to date", "All time"
];

function App() {
  const [industry, setIndustry] = useState('');
  const [company, setCompany] = useState('');
  const [timePeriod, setTimePeriod] = useState('');
  const [stockData, setStockData] = useState(null); // State for stock data
  const [stockValuation, setStockValuation] = useState(null); // State for stock valuation
  const [loading, setLoading] = useState(false);

  const fetchStockValuation = async (company_name) => {
    const response = await fetch('/api/stock-valuation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ company_name }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to fetch stock valuation');
    }

    const data = await response.json();
    return data;
  };

  const handleFetchValuation = async () => {
    setLoading(true);
    try {
      const data = await fetchStockValuation(company);
      console.log(data)
      setStockValuation(data);
    } catch (error) {
      console.error('Error fetching stock valuation:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch('/api/stock-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          industry,
          company,
          time_period: timePeriod,
        }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.json();
      setStockData(data);
    } catch (error) {
      console.error("Error fetching data", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.app}>
      <h1 style={styles.header}>Stock Data Viewer</h1>
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.formGroup}>
          <label style={styles.label}>Industry:</label>
          <select value={industry} onChange={(e) => setIndustry(e.target.value)} style={styles.select}>
            <option value="">Select Industry</option>
            {Object.keys(industries).map((ind) => (
              <option key={ind} value={ind}>{ind}</option>
            ))}
          </select>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Company:</label>
          <select value={company} onChange={(e) => setCompany(e.target.value)} disabled={!industry} style={styles.select}>
            <option value="">Select Company</option>
            {industry && industries[industry].map((comp) => (
              <option key={comp} value={comp}>{comp}</option>
            ))}
          </select>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>Time Period:</label>
          <select value={timePeriod} onChange={(e) => setTimePeriod(e.target.value)} style={styles.select}>
            <option value="">Select Time Period</option>
            {timePeriods.map((period) => (
              <option key={period} value={period}>{period}</option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={timePeriod === '' || industry === '' || company === ''}>Get Data</button>
      </form>

      <button 
        onClick={handleFetchValuation} 
        disabled={company === ''} 
        style={{ marginTop: '1em' }}
      >
        Get Stock Valuation
      </button>

      {loading && <div style={styles.loader}>Loading...</div>}

      {stockData && (
        <div style={styles.resultContainer}>
          {loading && <div style={styles.overlay}>
            <div style={styles.loader}></div>
          </div>}
          <div style={loading ? styles.resultLoading : styles.result}>
            <h2>Results for {stockData.company}</h2>
            <img src={`data:image/png;base64,${stockData.plot_url}`} alt="Stock Plot" style={styles.image} />
            <ul style={styles.list}>
              {Object.entries(stockData.summary_data).map(([key, value]) => (
                <li key={key} style={styles.listItem}>{key}: {value}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {stockValuation && (
        <div style={styles.resultContainer}>
          <div style={styles.result}>
            <h2>Results for {stockValuation.Ticker}</h2>
            <ul style={styles.list}>
              <li>Company Name: {stockValuation['Company Name']}</li>
              <li>Sector: {stockValuation.Sector}</li>
              <li>Enterprise Value (Millions): {stockValuation['Enterprise Value (Millions)']}</li>
              <li>Net Debt (Millions): {stockValuation['Net Debt (Millions)']}</li>
              <li>Equity Value (Millions): {stockValuation['Equity Value (Millions)']}</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  app: {
    fontFamily: 'Arial, sans-serif',
    maxWidth: '600px',
    margin: '0 auto',
    padding: '20px',
    textAlign: 'center',
  },
  header: {
    color: '#333',
    marginBottom: '20px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  formGroup: {
    marginBottom: '15px',
    width: '100%',
  },
  label: {
    display: 'block',
    marginBottom: '5px',
    fontWeight: 'bold',
  },
  select: {
    width: '100%',
    padding: '8px',
    borderRadius: '4px',
    border: '1px solid #ccc',
  },
  resultContainer: {
    position: 'relative',
    marginTop: '20px',
  },
  result: {
    textAlign: 'left',
  },
  list: {
    listStyleType: 'none',
    padding: '0',
  },
  loader: {
    marginTop: '1em',
    fontSize: '1.2em',
  },
};

export default App;