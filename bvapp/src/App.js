import React, { useState } from 'react';
import Plot from 'react-plotly.js';
import { BounceLoader } from 'react-spinners'; // Import the spinner

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
  const [stockDataPlot, setStockDataPlot] = useState(0);
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
      setStockDataPlot(JSON.parse(data.plot));
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
        <button 
          variant="contained" 
          color="primary" 
          type="submit" 
          disabled={timePeriod === '' || industry === '' || company === ''}
          style={timePeriod === '' || industry === '' || company === '' ? styles.buttonDisabled : styles.button}
        >
          Get Data
          </button>
      </form>

      <button 
        variant="contained" 
        color="secondary" 
        onClick={handleFetchValuation} 
        disabled={company === ''} 
        style={company === '' ? styles.buttonDisabled : styles.button}
      >
        Get Stock Valuation
      </button>

      {loading && (
        <div style={styles.loader}>
          <BounceLoader color="#007bff" loading={loading} size={50} /> 
        </div>
      )}

      
      {stockData && (
        <div style={styles.resultContainer}>
          <h2 style={styles.resultHeader}>{stockData.company} Overview</h2>
          <div style={styles.plotContainer}>
            <Plot data={stockDataPlot.data} layout={stockDataPlot.layout} />
          </div>
          <ul style={styles.list}>
            {Object.entries(stockData.summary_data).map(([key, value]) => (
              <li key={key} style={styles.listItem}>{key}: {value}</li>
            ))}
          </ul>
          <ul style={styles.list}>
            {Object.entries(stockData.info).map(([key, value]) => (
              <li key={key} style={styles.listItem}>{key}: {value}</li>
            ))}
          </ul>
        </div>
      )}

      {stockValuation && (
        <div style={styles.resultContainer}>
          <h2 style={styles.resultHeader}>Results for {stockValuation.Ticker}</h2>
          <ul style={styles.list}>
            <li>Company Name: {stockValuation['Company Name']}</li>
            <li>Sector: {stockValuation.Sector}</li>
            <li>Enterprise Value (Millions): {stockValuation['Enterprise Value (Millions)']}</li>
            <li>Net Debt (Millions): {stockValuation['Net Debt (Millions)']}</li>
            <li>Equity Value (Millions): {stockValuation['Equity Value (Millions)']}</li>
            <li>Intrinsic Value per Share: {stockValuation['Intrinsic Value per Share']}</li>
          </ul>
        </div>
      )}
    </div>
  );
}

const styles = {
  app: {
    fontFamily: 'Arial, sans-serif',
    maxWidth: '800px', // Increased width for better layout
    margin: '0 auto',
    padding: '20px',
    textAlign: 'center',
    backgroundColor: '#f9f9f9', // Light background for better contrast
    borderRadius: '8px', // Rounded corners
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)', // Subtle shadow
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
    padding: '10px', // Increased padding for better touch targets
    borderRadius: '4px',
    border: '1px solid #ccc',
    fontSize: '16px', // Larger font for better readability
  },
  button: {
    margin:'0.5em',
    padding: '10px 20px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: '#007bff', // Bootstrap primary color
    color: '#fff',
    fontSize: '16px',
    cursor: 'pointer',
    transition: 'background-color 0.3s',
  },
  buttonDisabled: {
    margin:'0.5em',
    padding: '10px 20px',
    borderRadius: '4px',
    border: 'none',
    color: '#fff',
    fontSize: '16px',
    transition: 'background-color 0.3s',
    backgroundColor: '#ccc',
    cursor: 'not-allowed',
  },
  resultContainer: {
    position: 'relative',
    marginTop: '20px',
    textAlign: 'left',
    padding: '20px',
    backgroundColor: '#fff', // White background for results
    borderRadius: '8px',
    boxShadow: '0 2px 5px rgba(0, 0, 0, 0.1)', // Subtle shadow for results
  },
  resultHeader: {
    marginBottom: '10px',
    fontSize: '20px',
    fontWeight: 'bold',
  },
  plotContainer: {
    display: 'flex',
    justifyContent: 'center', // Center the plot
    marginBottom: '15px',
  },
  image: {
    maxWidth: '100%', // Ensure the image is responsive
    height: 'auto',
    borderRadius: '4px', // Rounded corners for the image
  },
  list: {
    listStyleType: 'none',
    padding: '0',
  },
  listItem: {
    marginBottom: '8px',
    fontSize: '16px',
  },
loader: {
    display: 'flex',
    justifyContent: 'center', // Center horizontally
    alignItems: 'center', // Center vertically
    height: '100vh', // Full height of the viewport
    position: 'absolute', // Position it absolutely
    top: 0, // Align to the top
    left: 0, // Align to the left
    right: 0, // Align to the right
    bottom: 0, // Align to the bottom
    backgroundColor: 'rgba(255, 255, 255, 0.8)', // Optional: semi-transparent background
    zIndex: 1000, // Ensure it appears above other content
  },
};

export default App;